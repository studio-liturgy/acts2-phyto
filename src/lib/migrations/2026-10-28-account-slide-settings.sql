-- ============================================================
-- Phyto - workspace_settings: the account's slide templates and fade time
-- ============================================================
-- The Song Template, Scripture Template (SetTemplate JSON) and the
-- presenter's fade time (ms) are saved on the account's PERSONAL
-- workspace_settings row so every device the account signs in on gets them,
-- like `background` (2026-10-22-account-background.sql).
--
-- DATA SAFETY: additive only. Adds three nullable columns; no row is changed
-- and no policy changes (the existing personal insert/update policies cover
-- them). Safe to re-run. Shared prod+test DB safe. Until applied the app
-- keeps these settings on the device only.
-- ============================================================

begin;

alter table public.workspace_settings add column if not exists song_template jsonb;
alter table public.workspace_settings add column if not exists scripture_template jsonb;
alter table public.workspace_settings add column if not exists fade_ms integer;

commit;
