import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});
// Offline: two verses of any passage in any version, read as its
// abbreviation ("NIV sixteen"). Agarabi (yv:935) names John "Yoni", as
// YouVersion does; a passage called "Missing" can't be found. Every call is
// recorded.
const { fetchCalls } = vi.hoisted(() => ({
  fetchCalls: [] as { q: string; code: string; hints?: string[] }[],
}));
vi.mock("@/lib/bible", async (orig) => {
  const real = await orig<typeof import("@/lib/bible")>();
  return {
    ...real,
    fetchScripture: async (q: string, code: string, opts?: { hints?: string[] }) => {
      fetchCalls.push({ q, code, hints: opts?.hints });
      if (q.startsWith("Missing")) throw new Error("No verses found in that range.");
      return {
        reference: code === "yv:935" ? q.replace("John", "Yoni") : "Ruth 1:16-17",
        verses: [
          { book: 8, chapter: 1, verse: 16, text: `${real.versionAbbr(code)} sixteen` },
          { book: 8, chapter: 1, verse: 17, text: `${real.versionAbbr(code)} seventeen` },
        ],
      };
    },
  };
});

/** A new set's version: YouVersion's NIV. Sets stored with bolls' "NIV" keep it. */
const NIV = "yv:111";

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
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
  await act(async () => {});
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {});

  const after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual([NIV, "CUNPS"]);
  expect(after.scriptureImports).toEqual(["Ruth 1:16-17"]);
  expect(after.slides.map((s) => Object.keys(s.linesByVersion ?? {}))).toEqual([
    [NIV, "CUNPS"],
    [NIV, "CUNPS"],
  ]);
});

it("removing every verse clears the recorded versions", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
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
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
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
  expect(after.slides[2].linesByVersion).toEqual({ [NIV]: "We believe", CUNPS: "我们相信" });
  expect(after.slides[2].referencesByVersion).toEqual({ [NIV]: "Our creed", CUNPS: "信经" });

  // Change the 2nd version: the passage is fetched again in CUV, the manual
  // verse keeps its text under the new column.
  await act(async () => api!.setTranslation2("CUV"));
  await act(async () => {});
  await act(async () => {});
  after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual([NIV, "CUV"]);
  expect(after.scriptureImports).toEqual(["Ruth 1:16-17"]);
  expect(after.slides.map((s) => [s.manual, s.linesByVersion])).toEqual([
    [undefined, { [NIV]: "NIV sixteen", CUV: "CUV sixteen" }],
    [undefined, { [NIV]: "NIV seventeen", CUV: "CUV seventeen" }],
    [true, { [NIV]: "We believe", CUV: "我们相信" }],
  ]);
  expect(after.slides[2].referencesByVersion).toEqual({ [NIV]: "Our creed", CUV: "信经" });
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

it("the Version reference toggle relabels fetched passages, not manual verses", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
  await act(async () => {});
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => api!.addManualVerse());
  await act(async () => {});
  await act(async () => {
    api!.setManualText((t) => t.replace("[~]", "[~Our creed]\nWe believe"));
    api!.setManualText2((t) => t.replace("[~]", "[~信经]\n我们相信"));
  });
  await act(async () => {});
  expect(api!.versionRefs).toBe(true);
  expect(useLibrary.getState().sets[set.id].slides[0].referencesByVersion).toEqual({
    [NIV]: "Ruth 1:16-17 NIV",
    CUNPS: "Ruth 1:16-17 CUNPS",
  });

  await act(async () => api!.setVersionRefs(false));
  await act(async () => {});
  let after = useLibrary.getState().sets[set.id];
  expect(after.versionRefs).toBe(false);
  expect(after.slides.map((s) => s.referencesByVersion)).toEqual([
    { [NIV]: "Ruth 1:16-17", CUNPS: "Ruth 1:16-17" },
    { [NIV]: "Ruth 1:16-17", CUNPS: "Ruth 1:16-17" },
    { [NIV]: "Our creed", CUNPS: "信经" },
  ]);

  await act(async () => api!.setVersionRefs(true));
  await act(async () => {});
  after = useLibrary.getState().sets[set.id];
  expect(after.slides[1].reference).toBe("Ruth 1:16-17 NIV");
  expect(after.slides[2].referencesByVersion).toEqual({ [NIV]: "Our creed", CUNPS: "信经" });
});

it("switching two versions on fetches the 2nd for the passages already there", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {});
  let after = useLibrary.getState().sets[set.id];
  expect(after.slides.map((s) => s.lines)).toEqual([["NIV sixteen"], ["NIV seventeen"]]);
  expect(api!.twoVersions).toBe(false);

  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("KRV");
  });
  await act(async () => {});
  await act(async () => {});
  after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual([NIV, "KRV"]);
  expect(after.slides.map((s) => s.linesByVersion)).toEqual([
    { [NIV]: "NIV sixteen", KRV: "KRV sixteen" },
    { [NIV]: "NIV seventeen", KRV: "KRV seventeen" },
  ]);
});

it("switching two versions off keeps the 1st version's text, edits included", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
  await act(async () => {});
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {});
  // An edit to the 1st version's text, which a re-fetch would lose.
  await act(async () => api!.setManualText((t) => t.replace("NIV sixteen", "Where you go")));
  await act(async () => {});

  await act(async () => api!.setTwoVersions(false));
  await act(async () => {});
  await act(async () => {});
  const after = useLibrary.getState().sets[set.id];
  expect(api!.twoVersions).toBe(false);
  expect(after.versions).toEqual([NIV]);
  expect(after.slides.map((s) => [s.lines, s.linesByVersion])).toEqual([
    [["Where you go"], undefined],
    [["NIV seventeen"], undefined],
  ]);
});

it("switching two versions off on a message drops the 2nd from its verse slides", async () => {
  const set = makeSet({
    kind: "message",
    versions: ["NIV", "CUNPS"],
    slides: [
      {
        id: "v1",
        kind: "scripture",
        importIndex: 0,
        reference: "Ruth 1:16 NIV",
        section: "Ruth 1:16 NIV",
        lines: ["Where you go"],
        linesByVersion: { NIV: "Where you go", CUNPS: "你往哪里去" },
        referencesByVersion: { NIV: "Ruth 1:16 NIV", CUNPS: "路得记 1:16 CUNPS" },
      },
      { id: "p1", kind: "point", pointType: "statement", lines: ["A point"] },
    ],
  });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} kind="message" />));
  expect(api!.twoVersions).toBe(true);
  expect(api!.translation2).toBe("CUNPS");

  await act(async () => api!.setTwoVersions(false));
  await act(async () => {});
  const after = useLibrary.getState().sets[set.id];
  expect(after.versions).toEqual(["NIV"]);
  expect(after.slides[0]).toEqual({
    id: "v1",
    kind: "scripture",
    importIndex: 0,
    reference: "Ruth 1:16 NIV",
    section: "Ruth 1:16 NIV",
    lines: ["Where you go"],
  });
  expect(after.slides[1].id).toBe("p1");
});

it("a new set starts in the version used most recently, and pairs with the last 2nd", async () => {
  const older = makeSet({
    kind: "scripture",
    versions: ["ESV", "KRV"],
    updatedAt: 1,
    slides: [
      {
        id: "a",
        kind: "scripture",
        lines: ["x"],
        linesByVersion: { ESV: "x", KRV: "y" },
      },
    ],
  });
  const newer = makeSet({
    kind: "scripture",
    versions: ["NLT"],
    updatedAt: 2,
    slides: [{ id: "b", kind: "scripture", lines: ["z"] }],
  });
  const fresh = makeSet({ kind: "scripture", slides: [], updatedAt: 3 });
  await db.sets.bulkPut([older, newer, fresh]);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={fresh.id} />));
  expect(api!.translation).toBe("NLT");
  expect(api!.recentVersions).toEqual(["NLT", "ESV", "KRV"]);

  await act(async () => api!.setTwoVersions(true));
  expect(api!.translation2).toBe("KRV");
});

it("switching two versions on fetches every passage in the 1st version, whatever it was imported in", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  // One passage in Agarabi (its reference names the book "Yoni"), one in NIV.
  await act(async () => api!.setTranslation("yv:935"));
  await act(async () => {
    await api!.importScripture("John 3:16");
  });
  await act(async () => api!.setTranslation(NIV));
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  await act(async () => {});
  expect(api!.manualText).toContain("[Yoni 3:16 agd]");

  fetchCalls.length = 0;
  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
  await act(async () => {});
  await act(async () => {});

  // The Agarabi passage is fetched again by its own reference, with Agarabi's
  // book names in play.
  const yoni = fetchCalls.find((c) => c.q === "Yoni 3:16" && c.code === NIV);
  expect(yoni?.hints).toContain("yv:935");
  const after = useLibrary.getState().sets[set.id];
  expect(api!.err).toBeNull();
  expect(after.versions).toEqual([NIV, "CUNPS"]);
  expect(after.slides.map((s) => s.linesByVersion?.[NIV])).toEqual([
    "NIV sixteen",
    "NIV seventeen",
    "NIV sixteen",
    "NIV seventeen",
  ]);
});

it("a passage that can't be fetched again stays as it was; the rest still change", async () => {
  const set = makeSet({ kind: "scripture", slides: [] });
  await db.sets.put(set);
  await useLibrary.getState().loadFromDb();
  await act(async () => root.render(<Harness setId={set.id} />));
  await act(async () => {
    await api!.importScripture("Ruth 1:16-17");
  });
  // A passage whose reference no longer fetches.
  await act(async () => api!.setManualText((t) => `${t}\n---\n[Missing 1:1 NIV]\nKept as typed`));
  await act(async () => {});

  await act(async () => {
    api!.setTwoVersions(true);
    api!.setTranslation2("CUNPS");
  });
  await act(async () => {});
  await act(async () => {});

  expect(api!.err).toMatch(/Missing 1:1/);
  const after = useLibrary.getState().sets[set.id];
  expect(after.slides.map((s) => s.linesByVersion?.[NIV])).toEqual([
    "NIV sixteen",
    "NIV seventeen",
    "Kept as typed",
  ]);
  expect(after.slides[0].linesByVersion?.CUNPS).toBe("CUNPS sixteen");
});
