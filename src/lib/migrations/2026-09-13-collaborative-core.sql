-- ============================================================
-- Phyto - Collaborative core (Stage 2)
-- ============================================================
-- Adds shared/collaborative rows: group workspaces and per-set shares.
--
-- DATA SAFETY GUARANTEE
--   This migration does NOT delete, update, or truncate any row, and does NOT
--   drop any table or column. Every statement is one of:
--     * CREATE TABLE IF NOT EXISTS          (new tables only)
--     * ALTER TABLE ADD COLUMN IF NOT EXISTS (new nullable column)
--     * CREATE OR REPLACE FUNCTION           (code, not data)
--     * CREATE INDEX IF NOT EXISTS           (derived, not data)
--     * DROP POLICY / CREATE POLICY          (ACCESS RULES, not data)
--   The only DROP statements are DROP POLICY: they remove RLS *rules* (never
--   rows) and each is recreated as a superset in the SAME transaction, so no
--   window exists where a table is unprotected or unreadable. No user data can
--   be lost by running this.
--
-- ATOMIC: the whole script runs inside one transaction (BEGIN/COMMIT). If any
-- statement fails, the entire migration rolls back and nothing is applied - no
-- half-migrated state.
--
-- SHARED DATABASE: one Supabase project serves prod AND test, so this changes
-- the schema prod reads from too. It is behavior-preserving for existing rows:
-- every current row has group_id NULL and no shares, so access stays owner-only
-- exactly as today. The broadened policies only ADD access (to group members and
-- share grantees); they never narrow an owner's access.
--
-- The Supabase editor flags this as containing "destructive operations" purely
-- because of the DROP POLICY lines above - not because any data is dropped.
--
-- RECOMMENDED before running: take a snapshot (Supabase Database -> Backups, or
-- PITR) so there is a one-click restore point, and note the row counts first:
--     select (select count(*) from sets) as sets, (select count(*) from gatherings) as gatherings;
-- Run the same query after; the numbers must be identical.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. New tables (additive; no effect on any existing row).
-- ------------------------------------------------------------
create table if not exists groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  owner_id   uuid        references auth.users not null,
  created_at timestamptz not null default now()
);
alter table groups enable row level security;

create table if not exists group_members (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        references groups on delete cascade not null,
  user_id    uuid        references auth.users,        -- NULL until the invitee claims it
  email      text        not null,
  role       text        not null default 'member' check (role in ('admin', 'member')),
  added_by   uuid        references auth.users,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
alter table group_members enable row level security;

create table if not exists set_shares (
  id              uuid        primary key default gen_random_uuid(),
  set_id          uuid        references sets on delete cascade not null,
  owner_id        uuid        references auth.users not null,
  grantee_email   text        not null,
  grantee_user_id uuid        references auth.users,   -- NULL until the grantee claims it
  created_at      timestamptz not null default now(),
  unique (set_id, grantee_email)
);
alter table set_shares enable row level security;

-- ------------------------------------------------------------
-- 2. SECURITY DEFINER helpers. Defined AFTER their tables exist (a LANGUAGE sql
--    body is validated at creation). They run as the owner, bypassing RLS, which
--    is what stops a group_members policy that queries group_members from
--    recursing. `set search_path = public` hardens them.
-- ------------------------------------------------------------
create or replace function is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from group_members gm where gm.group_id = gid and gm.user_id = uid);
$$;

create or replace function is_group_owner(gid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups g where g.id = gid and g.owner_id = uid);
$$;

create or replace function is_set_shared_with(sid uuid, uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from set_shares s where s.set_id = sid and s.grantee_user_id = uid);
$$;

grant execute on function is_group_member(uuid, uuid) to authenticated, anon;
grant execute on function is_group_owner(uuid, uuid) to authenticated, anon;
grant execute on function is_set_shared_with(uuid, uuid) to authenticated, anon;

-- ------------------------------------------------------------
-- 3. Policies on the new tables.
-- ------------------------------------------------------------
-- groups: owner + members read; only the owner writes.
drop policy if exists "groups: member select" on groups;
create policy "groups: member select" on groups for select
  using (owner_id = auth.uid() or is_group_member(id, auth.uid()));

drop policy if exists "groups: owner insert" on groups;
create policy "groups: owner insert" on groups for insert
  with check (owner_id = auth.uid());

drop policy if exists "groups: owner update" on groups;
create policy "groups: owner update" on groups for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "groups: owner delete" on groups;
create policy "groups: owner delete" on groups for delete
  using (owner_id = auth.uid());

-- group_members: members + owner read the roster; a pending invitee sees their
-- own row by email to claim it. Owner adds/manages; invitee claims own row;
-- owner or self deletes (kick / leave).
drop policy if exists "group_members: read" on group_members;
create policy "group_members: read" on group_members for select
  using (
    is_group_owner(group_id, auth.uid())
    or is_group_member(group_id, auth.uid())
    or email = (auth.jwt() ->> 'email')
  );

drop policy if exists "group_members: owner insert" on group_members;
create policy "group_members: owner insert" on group_members for insert
  with check (is_group_owner(group_id, auth.uid()));

drop policy if exists "group_members: update" on group_members;
create policy "group_members: update" on group_members for update
  using (is_group_owner(group_id, auth.uid()) or email = (auth.jwt() ->> 'email'))
  with check (
    is_group_owner(group_id, auth.uid())
    or (email = (auth.jwt() ->> 'email') and user_id = auth.uid())
  );

drop policy if exists "group_members: delete" on group_members;
create policy "group_members: delete" on group_members for delete
  using (is_group_owner(group_id, auth.uid()) or user_id = auth.uid());

-- set_shares: owner + grantee read; only the set's owner creates/revokes; the
-- grantee may claim their own row.
drop policy if exists "set_shares: read" on set_shares;
create policy "set_shares: read" on set_shares for select
  using (
    owner_id = auth.uid()
    or grantee_user_id = auth.uid()
    or grantee_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "set_shares: owner insert" on set_shares;
create policy "set_shares: owner insert" on set_shares for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from sets s where s.id = set_id and s.user_id = auth.uid())
  );

drop policy if exists "set_shares: update" on set_shares;
create policy "set_shares: update" on set_shares for update
  using (owner_id = auth.uid() or grantee_email = (auth.jwt() ->> 'email'))
  with check (
    owner_id = auth.uid()
    or (grantee_email = (auth.jwt() ->> 'email') and grantee_user_id = auth.uid())
  );

drop policy if exists "set_shares: owner delete" on set_shares;
create policy "set_shares: owner delete" on set_shares for delete
  using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- 4. sets: add group_id (additive, nullable) + broaden RLS. user_id keeps its
--    meaning as the CONTRIBUTOR. with_check uses the SAME membership predicate
--    (not user_id = auth.uid()), so a member can edit a row they didn't author
--    and the original contributor is preserved. For a personal row (group_id
--    NULL, no shares) every predicate reduces to user_id = auth.uid() - i.e.
--    identical to today.
-- ------------------------------------------------------------
alter table sets add column if not exists group_id uuid references groups(id) on delete set null;

drop policy if exists "sets: owner select" on sets;
drop policy if exists "sets: member select" on sets;
create policy "sets: member select" on sets for select
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
  );

drop policy if exists "sets: owner insert" on sets;
drop policy if exists "sets: member insert" on sets;
create policy "sets: member insert" on sets for insert
  with check (
    user_id = auth.uid()
    and (group_id is null or is_group_member(group_id, auth.uid()))
  );

drop policy if exists "sets: owner update" on sets;
drop policy if exists "sets: member update" on sets;
create policy "sets: member update" on sets for update
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
    or is_set_shared_with(id, auth.uid())
  );

-- Delete: owner or group member (a shared-single-set grantee cannot delete the
-- owner's set).
drop policy if exists "sets: owner delete" on sets;
drop policy if exists "sets: member delete" on sets;
create policy "sets: member delete" on sets for delete
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
  );

-- ------------------------------------------------------------
-- 5. gatherings: add group_id + broaden RLS. The public share_token SELECT
--    policy is a SEPARATE policy and is intentionally left intact.
-- ------------------------------------------------------------
alter table gatherings add column if not exists group_id uuid references groups(id) on delete set null;

drop policy if exists "gatherings: owner select" on gatherings;
drop policy if exists "gatherings: member select" on gatherings;
create policy "gatherings: member select" on gatherings for select
  using (
    user_id = auth.uid()
    or (group_id is not null and is_group_member(group_id, auth.uid()))
  );

drop policy if exists "gatherings: owner insert" on gatherings;
drop policy if exists "gatherings: member insert" on gatherings;
create policy "gatherings: member insert" on gatherings for insert
  with check (
    user_id = auth.uid()
    and (group_id is null or is_group_member(group_id, auth.uid()))
  );

drop policy if exists "gatherings: owner update" on gatherings;
drop policy if exists "gatherings: member update" on gatherings;
create policy "gatherings: member update" on gatherings for update
  using (user_id = auth.uid() or (group_id is not null and is_group_member(group_id, auth.uid())))
  with check (user_id = auth.uid() or (group_id is not null and is_group_member(group_id, auth.uid())));

drop policy if exists "gatherings: owner delete" on gatherings;
drop policy if exists "gatherings: member delete" on gatherings;
create policy "gatherings: member delete" on gatherings for delete
  using (user_id = auth.uid() or (group_id is not null and is_group_member(group_id, auth.uid())));

-- ------------------------------------------------------------
-- 6. gathering_sets: follow the parent gathering's access (owner OR group
--    member). The public-when-live policy is separate and left intact.
-- ------------------------------------------------------------
drop policy if exists "gathering_sets: owner select" on gathering_sets;
drop policy if exists "gathering_sets: member select" on gathering_sets;
create policy "gathering_sets: member select" on gathering_sets for select
  using (exists (
    select 1 from gatherings g
    where g.id = gathering_id
      and (g.user_id = auth.uid()
           or (g.group_id is not null and is_group_member(g.group_id, auth.uid())))
  ));

drop policy if exists "gathering_sets: owner insert" on gathering_sets;
drop policy if exists "gathering_sets: member insert" on gathering_sets;
create policy "gathering_sets: member insert" on gathering_sets for insert
  with check (exists (
    select 1 from gatherings g
    where g.id = gathering_id
      and (g.user_id = auth.uid()
           or (g.group_id is not null and is_group_member(g.group_id, auth.uid())))
  ));

drop policy if exists "gathering_sets: owner update" on gathering_sets;
drop policy if exists "gathering_sets: member update" on gathering_sets;
create policy "gathering_sets: member update" on gathering_sets for update
  using (exists (
    select 1 from gatherings g
    where g.id = gathering_id
      and (g.user_id = auth.uid()
           or (g.group_id is not null and is_group_member(g.group_id, auth.uid())))
  ));

drop policy if exists "gathering_sets: owner delete" on gathering_sets;
drop policy if exists "gathering_sets: member delete" on gathering_sets;
create policy "gathering_sets: member delete" on gathering_sets for delete
  using (exists (
    select 1 from gatherings g
    where g.id = gathering_id
      and (g.user_id = auth.uid()
           or (g.group_id is not null and is_group_member(g.group_id, auth.uid())))
  ));

-- ------------------------------------------------------------
-- 7. Indexes (additive; derived data, no rows touched).
-- ------------------------------------------------------------
create index if not exists sets_group_id_idx        on sets(group_id);
create index if not exists gatherings_group_id_idx  on gatherings(group_id);
create index if not exists group_members_user_idx   on group_members(user_id, group_id);
create index if not exists group_members_email_idx  on group_members(email);
create index if not exists set_shares_set_grantee_idx on set_shares(set_id, grantee_user_id);
create index if not exists set_shares_grantee_user_idx on set_shares(grantee_user_id);
create index if not exists set_shares_grantee_email_idx on set_shares(grantee_email);

commit;

-- ============================================================
-- Post-check (run separately, after): row counts must be unchanged.
--   select (select count(*) from sets) as sets, (select count(*) from gatherings) as gatherings;
-- ============================================================
