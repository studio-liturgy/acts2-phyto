-- Group invites become accept/decline (like set shares) instead of auto-join.
--
-- A pending invite is a group_members row addressed by email with user_id NULL.
-- For the invitee to SEE the invite (the group's name) and DECLINE it (delete
-- their own pending row), two policies must recognise a pending email invitee.
-- Both broadenings are additive and safe: they only ever grant a user access to
-- rows already addressed to their own email. No data is modified.
--
-- Idempotent + transaction-wrapped. Apply in the Supabase SQL editor.

begin;

-- SECURITY DEFINER helper (mirrors is_group_member / is_group_owner) so the
-- groups policy can test "is there an invite for this email in this group?"
-- without RLS recursion.
create or replace function is_group_invitee(gid uuid, mail text)
  returns boolean language sql security definer stable as $$
    select exists (
      select 1 from group_members gm
      where gm.group_id = gid and gm.email = mail
    );
$$;
grant execute on function is_group_invitee(uuid, text) to authenticated, anon;

-- 1) A pending invitee may read the group so the invite can show its name.
drop policy if exists "groups: member select" on groups;
create policy "groups: member select" on groups for select
  using (
    owner_id = auth.uid()
    or is_group_member(id, auth.uid())
    or is_group_invitee(id, (auth.jwt() ->> 'email'))
  );

-- 2) A pending invitee may delete their own invite row (decline). Owner (kick)
--    and self-by-user_id (leave) are preserved.
drop policy if exists "group_members: delete" on group_members;
create policy "group_members: delete" on group_members for delete
  using (
    is_group_owner(group_id, auth.uid())
    or user_id = auth.uid()
    or email = (auth.jwt() ->> 'email')
  );

commit;
