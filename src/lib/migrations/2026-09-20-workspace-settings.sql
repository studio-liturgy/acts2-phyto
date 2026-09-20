-- ============================================================
-- Phyto - workspace_settings: per-workspace preferences
-- ============================================================
-- Settings that belong to a WORKSPACE, not a device: the personal account has
-- one row (user_id) and each group has one (group_id). Today:
--   multi_language  false = project one bible version, the one in `language`;
--                   true  = stack every version a scripture set carries
--                   (songs will follow the same switch later).
--   language        the workspace's language (a LangCode, e.g. 'en', 'zh-Hans').
--
-- The phone view (/g/<slug>) follows the workspace its live gathering belongs
-- to, and the viewer is unauthenticated, so rows are publicly readable; they
-- hold nothing sensitive. Writes: the account owner for personal rows, the
-- group owner for group rows (members read them).
--
-- DATA SAFETY: purely additive. Creates ONE new table + its indexes and RLS
-- policies; touches no existing table or row. All-or-nothing; safe to re-run;
-- safe on the shared prod+test DB. Until applied the app degrades gracefully:
-- settings reads fall back to the defaults (single version, English) and writes
-- report an error in the dialog.
-- ============================================================

begin;

create table if not exists workspace_settings (
  id             uuid        primary key default gen_random_uuid(),
  -- Exactly ONE scope is set: a personal account (user_id) or a group (group_id).
  user_id        uuid        references auth.users on delete cascade,
  group_id       uuid        references groups     on delete cascade,
  multi_language boolean     not null default false,
  language       text        not null default 'en',
  -- The 2nd language, used only while multi_language is on.
  language2      text,
  updated_at     timestamptz not null default now(),
  constraint workspace_settings_one_scope check ((user_id is null) <> (group_id is null))
);

-- One row per personal account and per group.
create unique index if not exists workspace_settings_user_key
  on workspace_settings (user_id) where user_id is not null;
create unique index if not exists workspace_settings_group_key
  on workspace_settings (group_id) where group_id is not null;

alter table workspace_settings enable row level security;

drop policy if exists "workspace_settings: public select" on workspace_settings;
create policy "workspace_settings: public select"
  on workspace_settings for select
  using (true);

drop policy if exists "workspace_settings: personal insert" on workspace_settings;
create policy "workspace_settings: personal insert"
  on workspace_settings for insert
  with check (user_id = auth.uid() and group_id is null);

drop policy if exists "workspace_settings: personal update" on workspace_settings;
create policy "workspace_settings: personal update"
  on workspace_settings for update
  using (user_id = auth.uid() and group_id is null)
  with check (user_id = auth.uid() and group_id is null);

drop policy if exists "workspace_settings: group insert" on workspace_settings;
create policy "workspace_settings: group insert"
  on workspace_settings for insert
  with check (group_id is not null and is_group_owner(group_id, auth.uid()));

drop policy if exists "workspace_settings: group update" on workspace_settings;
create policy "workspace_settings: group update"
  on workspace_settings for update
  using (group_id is not null and is_group_owner(group_id, auth.uid()))
  with check (group_id is not null and is_group_owner(group_id, auth.uid()));

commit;
