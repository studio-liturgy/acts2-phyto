-- Usernames, step 2 (additive: new lookups only, no table or policy change).
-- phyto shows @handles (antho's `profiles`) instead of emails, and lets people
-- share a set or invite to a group by @handle. Emails never leave the
-- database: the share/invite functions look the address up themselves.

-- 1. Handles of accounts the caller is connected to: themselves, people in a
--    group with them (members, owner, pending invitees), and people a set was
--    shared between. Never a directory of everyone.
create or replace function public.profile_handles(p_user_ids uuid[])
returns table (user_id uuid, handle text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id, lower(auth.jwt() ->> 'email') as email
  ),
  my_groups as (
    select gm.group_id from group_members gm, me
    where gm.user_id = me.id or lower(gm.email) = me.email
    union
    select g.id from groups g, me where g.owner_id = me.id
  ),
  related as (
    select me.id as uid from me
    union
    select gm.user_id from group_members gm where gm.group_id in (select group_id from my_groups)
    union
    select gm.added_by from group_members gm where gm.group_id in (select group_id from my_groups)
    union
    select g.owner_id from groups g where g.id in (select group_id from my_groups)
    union
    select s.grantee_user_id from set_shares s, me where s.owner_id = me.id
    union
    select s.owner_id from set_shares s, me
    where s.grantee_user_id = me.id or lower(s.grantee_email) = me.email
  )
  select p.user_id, p.handle
  from profiles p
  where p.user_id = any (p_user_ids)
    and p.user_id in (select uid from related where uid is not null);
$$;

revoke all on function public.profile_handles(uuid[]) from public, anon;
grant execute on function public.profile_handles(uuid[]) to authenticated;

-- 2. Share one of my sets with a @handle. Returns 'ok', 'exists', 'self',
--    'no-user' or 'not-owner'. The grant row is the same as an email share.
create or replace function public.share_set_with_handle(p_set_id uuid, p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  target_email text;
begin
  if auth.uid() is null then
    return 'not-owner';
  end if;
  if not exists (select 1 from sets s where s.id = p_set_id and s.user_id = auth.uid()) then
    return 'not-owner';
  end if;
  select p.user_id into target from profiles p where p.handle = lower(trim(leading '@' from p_handle));
  if target is null then
    return 'no-user';
  end if;
  if target = auth.uid() then
    return 'self';
  end if;
  select lower(u.email) into target_email from auth.users u where u.id = target;
  if target_email is null then
    return 'no-user';
  end if;
  insert into set_shares (set_id, owner_id, grantee_email, grantee_user_id, owner_email)
  values (p_set_id, auth.uid(), target_email, null, auth.jwt() ->> 'email')
  on conflict (set_id, grantee_email) do nothing;
  if not found then
    return 'exists';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.share_set_with_handle(uuid, text) from public, anon;
grant execute on function public.share_set_with_handle(uuid, text) to authenticated;

-- 3. Invite a @handle to a group I own. Same pending row as an email invite.
--    Returns 'ok', 'exists', 'self', 'no-user' or 'not-owner'.
create or replace function public.invite_handle_to_group(p_group_id uuid, p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  target_email text;
begin
  if auth.uid() is null or not is_group_owner(p_group_id, auth.uid()) then
    return 'not-owner';
  end if;
  select p.user_id into target from profiles p where p.handle = lower(trim(leading '@' from p_handle));
  if target is null then
    return 'no-user';
  end if;
  if target = auth.uid() then
    return 'self';
  end if;
  select lower(u.email) into target_email from auth.users u where u.id = target;
  if target_email is null then
    return 'no-user';
  end if;
  insert into group_members (group_id, email, role, added_by, added_by_email, user_id)
  values (p_group_id, target_email, 'member', auth.uid(), auth.jwt() ->> 'email', null)
  on conflict (group_id, email) do nothing;
  if not found then
    return 'exists';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.invite_handle_to_group(uuid, text) from public, anon;
grant execute on function public.invite_handle_to_group(uuid, text) to authenticated;
