-- ============================================================
-- Phyto - account_slugs: one persistent share URL per account / per group
-- ============================================================
-- A gathering is presented live at /g/<slug>. Previously <slug> was a gathering's
-- own share_token, so the public URL changed every time the leader went live on a
-- different gathering. This table moves the slug up to the ACCOUNT (personal) or
-- GROUP level: /g/<slug> resolves slug -> account/group -> whichever gathering is
-- currently live in that scope ("one live per scope"). So the URL is persistent
-- and simply follows go-live.
--
-- Retired slugs stay in this table (is_current = false) pointing at the same
-- account, which makes old links/QRs keep working for free — resolution is
-- identical whether the slug is current or retired.
--
-- DATA SAFETY: purely additive. Creates ONE new table + its indexes and RLS
-- policies. It does NOT touch gatherings, share_token, or any existing row, so
-- code that still resolves /g/<share_token> the old way (e.g. production, which
-- does not read this table) is completely unaffected. All-or-nothing; safe to
-- re-run; safe on the shared prod+test DB.
--
-- Until this migration is applied the app degrades gracefully: slug reads/writes
-- are best-effort and swallow the "relation does not exist" error, so the viewer
-- falls back to resolving a gathering's own share_token exactly as before.
-- ============================================================

begin;

create table if not exists account_slugs (
  -- The share slug (current or retired). PK, so the whole /g/<slug> namespace is
  -- globally unique across every account and group.
  slug        text        primary key,
  -- Exactly ONE scope is set: a personal account (user_id) or a group (group_id).
  user_id     uuid        references auth.users on delete cascade,
  group_id    uuid        references groups     on delete cascade,
  -- The account's/group's ACTIVE slug. Retired slugs linger as aliases.
  is_current  boolean     not null default true,
  created_at  timestamptz not null default now(),
  constraint account_slugs_one_scope check ((user_id is null) <> (group_id is null))
);

-- One CURRENT slug per personal account and per group (retired ones are unlimited).
create unique index if not exists account_slugs_user_current
  on account_slugs (user_id) where is_current and group_id is null;
create unique index if not exists account_slugs_group_current
  on account_slugs (group_id) where is_current and group_id is not null;

-- Speeds the scope -> live gathering resolution the viewer runs.
create index if not exists account_slugs_user_idx on account_slugs (user_id);
create index if not exists account_slugs_group_idx on account_slugs (group_id);

alter table account_slugs enable row level security;

-- The viewer is unauthenticated, so slugs must be publicly readable to resolve a
-- link to its account. Only a slug -> scope mapping is exposed; the gatherings'
-- own RLS still governs what the follow-up live-gathering fetch returns.
drop policy if exists "account_slugs: public select" on account_slugs;
create policy "account_slugs: public select"
  on account_slugs for select
  using (true);

-- Personal slugs: the account owner manages their own.
drop policy if exists "account_slugs: personal insert" on account_slugs;
create policy "account_slugs: personal insert"
  on account_slugs for insert
  with check (user_id = auth.uid() and group_id is null);

drop policy if exists "account_slugs: personal update" on account_slugs;
create policy "account_slugs: personal update"
  on account_slugs for update
  using (user_id = auth.uid() and group_id is null)
  with check (user_id = auth.uid() and group_id is null);

drop policy if exists "account_slugs: personal delete" on account_slugs;
create policy "account_slugs: personal delete"
  on account_slugs for delete
  using (user_id = auth.uid() and group_id is null);

-- Group slugs: a group owner manages the group's shared URL.
drop policy if exists "account_slugs: group insert" on account_slugs;
create policy "account_slugs: group insert"
  on account_slugs for insert
  with check (group_id is not null and is_group_owner(group_id, auth.uid()));

drop policy if exists "account_slugs: group update" on account_slugs;
create policy "account_slugs: group update"
  on account_slugs for update
  using (group_id is not null and is_group_owner(group_id, auth.uid()))
  with check (group_id is not null and is_group_owner(group_id, auth.uid()));

drop policy if exists "account_slugs: group delete" on account_slugs;
create policy "account_slugs: group delete"
  on account_slugs for delete
  using (group_id is not null and is_group_owner(group_id, auth.uid()));

commit;
