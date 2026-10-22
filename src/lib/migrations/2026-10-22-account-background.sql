-- ============================================================
-- Phyto - workspace_settings.background: the account's slide background
-- ============================================================
-- The presenter's Background card (black/white, an optional image with a dim
-- amount, and the screen's aspect ratio) is saved on the account's PERSONAL
-- workspace_settings row so every device the account signs in on gets it.
-- Shape: {"bg":"black"|"white","bgDim":0-90,"bgImage"?:url,"aspect"?:"16:9"|...}
--
-- DATA SAFETY: additive only. Adds one nullable column; no row is changed and
-- no policy changes (the existing personal insert/update policies cover it).
-- Safe to re-run. Shared prod+test DB safe. Until applied the app keeps the
-- background on the device only.
-- ============================================================

begin;

alter table public.workspace_settings add column if not exists background jsonb;

commit;
