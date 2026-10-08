import { useMemo, useState } from "react";
import { loadYvNames, YV_BIBLES, yvTitles } from "@/lib/youversion";
import { tagLanguageName } from "@/lib/bible";

type Notices = Record<string, string>;

/**
 * Every YouVersion Bible's copyright notice, for the Terms pages: YouVersion
 * asks that a Bible's notice be shown wherever its text is. The notices
 * (scripts/youversion-catalog.mjs snapshots them) only load when the list is
 * opened, and a search narrows it by abbreviation, title or language.
 */
export function BibleCopyrights() {
  const [notices, setNotices] = useState<Notices | null>(null);
  const [query, setQuery] = useState("");

  const load = () => {
    if (notices) return;
    void Promise.all([import("@/content/bible-copyrights.json"), loadYvNames()]).then(([m]) =>
      setNotices((m.default as unknown as { copyrights: Notices }).copyrights),
    );
  };

  const rows = useMemo(() => {
    if (!notices) return [];
    const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const q = fold(query.trim());
    return YV_BIBLES.filter((b) => notices[b.id])
      .map((b) => {
        const titles = yvTitles(b.id);
        return {
          ...b,
          title: titles?.title ?? "",
          english: titles?.english ?? "",
          language: tagLanguageName(b.tag),
          notice: notices[b.id],
        };
      })
      .filter(
        (b) => !q || [b.abbr, b.title, b.english, b.language].some((s) => fold(s).includes(q)),
      );
  }, [notices, query]);

  return (
    <details className="mt-3" onToggle={(e) => e.currentTarget.open && load()}>
      <summary className="cursor-pointer underline hover:opacity-60">
        Copyright notices for every YouVersion Bible
      </summary>
      {notices === null ? (
        <p className="mt-2 opacity-60">Loading…</p>
      ) : (
        <div className="mt-3 space-y-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a version or language"
            aria-label="Find a Bible version"
            className="w-full rounded-full border border-current bg-transparent px-4 py-2 outline-none"
          />
          {rows.length === 0 && <p className="opacity-60">No versions match.</p>}
          {rows.map((b) => (
            <div key={b.id}>
              <p className="font-semibold">
                {b.abbr}: {b.title} ({b.language})
              </p>
              <p className="whitespace-pre-line opacity-80">{b.notice}</p>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
