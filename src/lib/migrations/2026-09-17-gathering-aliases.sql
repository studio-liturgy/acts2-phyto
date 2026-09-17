-- ============================================================
-- Phyto - gathering_aliases: keep old share links working after a slug change
-- ============================================================
-- A gathering is shared at /g/<share_token>. When the owner customizes that slug,
-- the OLD token would otherwise 404 — breaking links and QR codes already handed
-- out. This table records each retired token so the public viewer can resolve it
-- back to the gathering. Live share_tokens always win over an alias (the viewer
-- looks up gatherings first), so an alias only ever fills in for a token no live
-- gathering claims.
--
-- DATA SAFETY: purely additive. Creates one table + its RLS policies. No existing
-- row is read, updated, deleted, or truncated; nothing is dropped except this
-- table's own policies, re-created in the same transaction. All-or-nothing. Safe
-- on the shared prod+test DB, and safe to re-run.
--
-- Until this migration is applied the app degrades gracefully: alias writes and
-- lookups are best-effort and swallow the "relation does not exist" error, so a
-- slug change is simply a hard cutover (old link stops working) exactly as before.
-- ============================================================

begin;

create table if not exists gathering_aliases (
  -- The retired share_token. PK so re-aliasing the same token is an idempotent
  -- upsert and two gatherings can't hold the same alias (last writer wins,
  -- subject to RLS — a cross-account overwrite is simply rejected).
  token        text        primary key,
  gathering_id uuid        references gatherings on delete cascade not null,
  -- Denormalized owner, so RLS can gate writes without a join to gatherings.
  user_id      uuid        references auth.users not null,
  created_at   timestamptz not null default now()
);

alter table gathering_aliases enable row level security;

-- The viewer is unauthenticated, so aliases must be publicly readable to resolve
-- an old link — mirrors the public-by-share_token select on `gatherings`. Only a
-- token → gathering_id mapping is exposed; the gathering's own RLS still governs
-- what the follow-up fetch returns.
drop policy if exists "gathering_aliases: public select" on gathering_aliases;
create policy "gathering_aliases: public select"
  on gathering_aliases for select
  using (true);

-- Owners manage only their own alias rows.
drop policy if exists "gathering_aliases: owner insert" on gathering_aliases;
create policy "gathering_aliases: owner insert"
  on gathering_aliases for insert
  with check (user_id = auth.uid());

drop policy if exists "gathering_aliases: owner update" on gathering_aliases;
create policy "gathering_aliases: owner update"
  on gathering_aliases for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "gathering_aliases: owner delete" on gathering_aliases;
create policy "gathering_aliases: owner delete"
  on gathering_aliases for delete
  using (user_id = auth.uid());

commit;
