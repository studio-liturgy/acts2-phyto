-- ============================================================
-- Phyto - workspace_settings: language codes become YouVersion's tags
-- ============================================================
-- phyto's language codes are now the BCP 47 tags YouVersion gives each
-- language's Bibles (see src/lib/langs.ts): simplified Chinese is 'zh' (was
-- 'zh-Hans'), traditional 'zh-Hant-TW' (was 'zh-Hant'). A workspace's language
-- is Chinese for either script, so both old codes become 'zh'.
--
-- DATA SAFETY: rewrites only the two Chinese codes, in workspace_settings
-- only. Safe to re-run (a second run matches nothing); safe on the shared
-- prod+test DB. OPTIONAL: the app already reads the old codes as the new ones
-- (toLangCode), so nothing breaks before or after it runs; this only tidies
-- what's stored. Deployed builds older than this change don't know 'zh' and
-- would read such a row as English, so run it once the new build is live.

begin;

update public.workspace_settings
   set language = 'zh'
 where language in ('zh-Hans', 'zh-Hant', 'zh-Latn');

update public.workspace_settings
   set language2 = 'zh'
 where language2 in ('zh-Hans', 'zh-Hant', 'zh-Latn');

commit;
