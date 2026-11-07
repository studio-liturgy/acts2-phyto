-- Group admins can delete any gathering in their group (Valiant, 2026-11-07).
-- 1. delete_group_gathering(p_id): the group's admin (groups.owner_id) deletes
--    another member's gathering and its slots, and writes the deletion
--    tombstone for the gathering's owner so the owner's devices drop their copy
--    instead of pushing it back.
-- 2. Closes the old door: ordinary members could delete any group gathering
--    directly. Now only the gathering's owner or the group's admin can.
begin;

create or replace function public.delete_group_gathering(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_group uuid;
begin
  select user_id, group_id into v_owner, v_group from gatherings where id = p_id;
  if not found then
    return false;
  end if;
  if v_group is null or not is_group_owner(v_group, auth.uid()) then
    raise exception 'only the group admin can delete this gathering' using errcode = '42501';
  end if;
  delete from gathering_sets where gathering_id = p_id;
  delete from gatherings where id = p_id;
  insert into deletions (id, user_id, kind, deleted_at)
  values (p_id, v_owner, 'gathering', now())
  on conflict (user_id, id) do update set kind = excluded.kind, deleted_at = excluded.deleted_at;
  return true;
end;
$$;

revoke all on function public.delete_group_gathering(uuid) from public, anon;
grant execute on function public.delete_group_gathering(uuid) to authenticated;

drop policy if exists "gatherings: member delete" on public.gatherings;
create policy "gatherings: owner or group admin delete" on public.gatherings
  for delete using (
    user_id = auth.uid()
    or (group_id is not null and is_group_owner(group_id, auth.uid()))
  );

commit;
