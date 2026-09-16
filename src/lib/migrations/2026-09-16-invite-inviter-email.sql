-- Show who invited you in the "you've been invited" notification.
--
-- A pending invitee can only read their own group_members row (by email), not
-- the owner's row, so the inviter's email can't be reached by a join. Store it
-- denormalized on the invite row instead: the invitee reads it off the same
-- row they already read to see the group name.

alter table group_members
  add column if not exists added_by_email text;
