-- Step 1 of 2 (additive). Tombstones become unique per account + id, so two
-- accounts that shared item ids in one browser can each record a deletion.
-- Safe to run now: existing ids are already unique, nothing else changes.
-- Step 2 (2026-10-20-deletions-per-account-2-swap-pk.sql) waits until the
-- client using onConflict "user_id,id" is live on phyto.live.

create unique index if not exists deletions_user_id_id_key
  on public.deletions (user_id, id);
