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
      reference: "Ruth 1:16-17",
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
function Harness({ setId, kind = "scripture" }: { setId: string; kind?: "scripture" | "message" }) {
  api = useScriptureVersions({ setId, kind });
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

it("a manual verse sits beside an import and stays put when the 2nd version changes", async () => {
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

  // A blank hand-typed verse after the passage; type its reference and text
  // the way the editor writes them into the boxes.
  await act(async () => api!.addManualVerse());
  await act(async () => {});
  await act(async () => {
    api!.setManualText((t) => t.replace("[~]", "[~Our creed]\nWe believe"));
    api!.setManualText2((t) => t.replace("[~]", "[~信经]\n我们相信"));
  });
  await act(async () => {});

  let after = useLibrary.getState().sets[set.id];
  expect(after.slides.map((s) => [s.manual, s.importIndex, s.reference])).toEqual([
    [undefined, 0, "Ruth 1:16-17 NIV"],
    [undefined, 0, "Ruth 1:16-17 NIV"],
    [true, 1, "Our creed"],
  ]);
  expect(after.slides[2].linesByVersion).toEqual({ NIV: "We believe", CUNPS: "我们相信" });
  expect(after.slides[2].referencesByVersion).toEqual({ NIV: "Our creed", CUNPS: "信经" });

  // Change the 2nd version: the passage is fetched again in CUV, the manual
  // verse keeps its text under the new column.
  await act(async () => api!.setTranslation2("CUV"));
  await act(async () => {});
  await act(async () => {});
  after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual(["NIV", "CUV"]);
  expect(after.scriptureImports).toEqual(["Ruth 1:16-17"]);
  expect(after.slides.map((s) => [s.manual, s.linesByVersion])).toEqual([
    [undefined, { NIV: "NIV sixteen", CUV: "CUV sixteen" }],
    [undefined, { NIV: "NIV seventeen", CUV: "CUV seventeen" }],
    [true, { NIV: "We believe", CUV: "我们相信" }],
  ]);
  expect(after.slides[2].referencesByVersion).toEqual({ NIV: "Our creed", CUV: "信经" });
});

it("a message's manual verse block keeps its text when its versions are re-fetched", async () => {
  const set = makeSet({
    kind: "message",
    versions: ["NIV", "CUNPS"],
    scriptureImports: ["Ruth 1:16-17"],
    slides: [
      {
        id: "v1",
        kind: "scripture",
        importIndex: 0,
        reference: "Ruth 1:16-17 NIV",
        lines: ["NIV sixteen"],
        linesByVersion: { NIV: "NIV sixteen", CUNPS: "CUNPS sixteen" },
        referencesByVersion: { NIV: "Ruth 1:16-17 NIV", CUNPS: "路得记 1:16-17 CUNPS" },
      },
      { id: "p1", kind: "point", pointType: "statement", lines: ["A point"] },
      {
        id: "m1",
        kind: "scripture",
        manual: true,
        importIndex: 1,
        reference: "Our creed",
        lines: ["We believe"],
        linesByVersion: { NIV: "We believe", CUNPS: "我们相信" },
        referencesByVersion: { NIV: "Our creed", CUNPS: "信经" },
      },
    ],
  });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  useLibrary.setState({
    workspaceSettings: { multiLanguage: true, language: "en", language2: "zh-Hans" },
  });
  await act(async () => root.render(<Harness setId={set.id} kind="message" />));
  await act(async () => {});
  await act(async () => {
    await api!.updateVersionsToWorkspace("NIV", "CUV");
  });
  await act(async () => {});

  const after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual(["NIV", "CUV"]);
  expect(after.scriptureImports).toEqual(["Ruth 1:16-17"]);
  expect(after.slides.map((s) => [s.kind, s.manual, s.linesByVersion])).toEqual([
    ["scripture", undefined, { NIV: "NIV sixteen", CUV: "CUV sixteen" }],
    ["scripture", undefined, { NIV: "NIV seventeen", CUV: "CUV seventeen" }],
    ["point", undefined, undefined],
    ["scripture", true, { NIV: "We believe", CUV: "我们相信" }],
  ]);
  expect(after.slides[3].id).toBe("m1");
  expect(after.slides[3].referencesByVersion).toEqual({ NIV: "Our creed", CUV: "信经" });
});
