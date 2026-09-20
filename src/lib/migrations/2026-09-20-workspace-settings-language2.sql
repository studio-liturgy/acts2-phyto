-- ============================================================
-- Phyto - workspace_settings.language2: the second language
-- ============================================================
-- With multi_language ON a workspace names TWO languages (1st and 2nd); the
-- scripture importer offers each one's bible versions and projection stacks
-- the set's version in each, in that order. With it OFF, `language` alone is
-- the workspace's system language.
--
-- DATA SAFETY: additive only. Adds one nullable column; no row is changed.
-- Safe to re-run (and safe if 2026-09-20-workspace-settings.sql was applied
-- from a version that already had the column). Shared prod+test DB safe.
-- ============================================================

begin;

alter table workspace_settings add column if not exists language2 text;

commit;
