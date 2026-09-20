import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});
// Bolls, offline: two verses of any passage in any version.
vi.mock("@/lib/bible", async (orig) => {
  const real = await orig<typeof import("@/lib/bible")>();
  return {
    ...real,
    fetchScriptureBolls: async (_q: string, code: string) => ({
      reference: `Ruth 1:16-17 ${code}`,
      verses: [
        { book: 8, chapter: 1, verse: 16, text: `${code} sixteen` },
        { book: 8, chapter: 1, verse: 17, text: `${code} seventeen` },
      ],
    }),
  };
});

import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { useScriptureVersions } from "@/hooks/use-scripture-versions";
import { resetDb } from "@/test/db-utils";
import { makeSet } from "@/test/fixtures";

let api: ReturnType<typeof useScriptureVersions> | null = null;
function Harness({ setId }: { setId: string }) {
  api = useScriptureVersions({ setId, kind: "scripture" });
  return null;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await resetDb();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("a set's FIRST two-version import records both versions", async () => {
  // The versions are written a render before the verses land; the "no verses
  // left, clear the versions" rule used to fire on that render, so the set
  // showed its 1st version only until the next import.
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  useLibrary.setState({
    workspaceSettings: { multiLanguage: true, language: "en", language2: "zh-Hans" },
  });
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => api!.setTranslation2("CUNPS"));
  await act(async () => {});
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {});

  const after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual(["NIV", "CUNPS"]);
  expect(after.scriptureImports).toEqual(["Ruth 1:16-17"]);
  expect(after.slides.map((s) => Object.keys(s.linesByVersion ?? {}))).toEqual([
    ["NIV", "CUNPS"],
    ["NIV", "CUNPS"],
  ]);
});

it("removing every verse clears the recorded versions", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  useLibrary.setState({
    workspaceSettings: { multiLanguage: true, language: "en", language2: "zh-Hans" },
  });
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => api!.setTranslation2("CUNPS"));
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {
    api!.setManualText("");
    api!.setManualText2("");
  });
  await act(async () => {});
  const after = useLibrary.getState().sets[set.id];
  expect(after.slides).toEqual([]);
  expect(after.versions).toBeUndefined();
});
