-- Step 2 of 2. Run ONLY after the "user_id,id" tombstone client is live on
-- phyto.live (main). Before that, prod still upserts with on_conflict=id and
-- needs the id-only key; dropping it first breaks every deletion on prod.
-- Makes (user_id, id) the primary key; the step 1 index becomes redundant.

begin;
alter table public.deletions drop constraint deletions_pkey;
alter table public.deletions add constraint deletions_pkey primary key (user_id, id);
drop index if exists public.deletions_user_id_id_key;
commit;
