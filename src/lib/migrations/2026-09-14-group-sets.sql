-- ============================================================
-- Phyto - group_sets: sharing a set to a group (Stage 4)
-- ============================================================
-- A group is a shared SET catalogue. Sharing a set to a group is a GRANT (like
-- sharing to a person): the set keeps its owner and stays in the owner's personal
-- library, and also appears in the group for every member, who can edit it
-- (two-way). One set can be granted to several groups. Owner OR group admin can
-- remove a set from a group.
--
-- DATA SAFETY: additive. Creates one table + one helper function, broadens two
-- SELECT/UPDATE policies on `sets` (only ADDING access), and backfills grants for
-- any sets that Stage 4a stamped with group_id. No row is deleted/updated/
-- truncated; nothing is dropped except policies re-created in the same
-- transaction. All-or-nothing. Safe on the shared prod+test DB, safe to re-run.
-- ============================================================

begin;

-- The grant: one row per (group, set). owner_email is denormalized so the group
-- catalogue can show who owns each set (auth.users email isn't readable via RLS).
create table if not exists group_sets (
  id          uuid        primary key default gen_random_uuid(),
  group_id    uuid        references groups on delete cascade not null,
  set_id      uuid        references sets   on delete cascade not null,
  owner_id    uuid        references auth.users not null,
  owner_email text,
  created_at  timestamptz not null default now(),
  unique (group_id, set_id)
);
alter table group_sets enable row level security;

-- Is `sid` granted to any group `uid` belongs to? SECURITY DEFINER so it can join
-- across grants + memberships without tripping RLS recursion.
create or replace function is_set_in_my_group(sid uuid, uid uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.group_sets gs
    join public.group_members gm on gm.group_id = gs.group_id
    where gs.set_id = sid and gm.user_id = uid
  );
$$;
grant execute on function is_set_in_my_group(uuid, uuid) to authenticated, anon;

-- group_sets policies.
drop policy if exists "group_sets: read" on group_sets;
create policy "group_sets: read" on group_sets for select
  using (is_group_member(group_id, auth.uid()) or owner_id = auth.uid());

-- Only a set's owner may grant their own set, and only to a group they're in.
drop policy if exists "group_sets: owner insert" on group_sets;
create policy "group_sets: owner insert" on group_sets for insert
  with check (
    owner_id = auth.uid()
    and is_group_member(group_id, auth.uid())
    and exists (select 1 from sets s where s.id = set_id and s.user_id = auth.uid())
  );

-- The set's owner (retract) OR the group's admin (tidy the pool) may remove it.
drop policy if exists "group_sets: delete" on group_sets;
create policy "group_sets: delete" on group_sets for delete
  using (owner_id = auth.uid() or is_group_owner(group_id, auth.uid()));

-- Broaden sets access: a set granted to a group I'm in is readable AND editable
-- by me (two-way). with_check mirrors using so a member can edit a set they don't
-- own; the owner (user_id) is preserved.
drop policy if exists "sets: member select" on sets;
create policy "sets: member select" on sets for select
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
    or is_set_in_my_group(id, auth.uid())
  );

drop policy if exists "sets: member update" on sets;
create policy "sets: member update" on sets for update
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
    or is_set_in_my_group(id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
    or is_set_in_my_group(id, auth.uid())
  );

-- Backfill: turn any Stage 4a group-stamped sets into grants so they show up in
-- the group under the new model too. Safe/no-op if there are none.
insert into group_sets (group_id, set_id, owner_id, owner_email)
select s.group_id, s.id, s.user_id, null
from sets s
where s.group_id is not null
on conflict (group_id, set_id) do nothing;

commit;
