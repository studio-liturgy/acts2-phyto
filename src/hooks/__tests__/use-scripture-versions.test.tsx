import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { mergeHiddenVersions, useScriptureVersions } from "@/hooks/use-scripture-versions";
import { resetDb } from "@/test/db-utils";
import { makeSet } from "@/test/fixtures";
import type { SetKind, Slide } from "@/lib/types";

// Drives the hook exactly as the Importers component does.
function Harness({ setId, kind }: { setId: string; kind: SetKind }) {
  useScriptureVersions({ setId, kind });
  return null;
}

// Shaped exactly as parseScriptureFromText stores verses (importIndex included),
// so a text round-trip reconciles back to these very slides.
const verse = (id: string, line: string): Slide => ({
  id,
  kind: "scripture",
  reference: "John 3:16",
  lines: [line],
  section: "John 3:16",
  importIndex: 0,
});
const verses: Slide[] = [verse("v1", "For God"), verse("v2", "so loved")];
const point: Slide = { id: "p1", kind: "point", pointType: "statement", lines: ["Grace"] };

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

describe("useScriptureVersions", () => {
  it("keeps the verses when a saved message loses its last point and flips back to scripture", async () => {
    const message = makeSet({ kind: "message", slides: [...verses, point] });
    await db.sets.put(message);
    await useLibrary.getState().loadFromDb();

    // Opened as a message: the box is empty and stays out of the way.
    await act(async () => root.render(<Harness setId={message.id} kind="message" />));
    expect(useLibrary.getState().sets[message.id].slides).toHaveLength(3);

    // The last point is removed and the set becomes a plain scripture again.
    useLibrary.getState().updateSet(message.id, {
      kind: "scripture",
      slides: verses,
    });
    await act(async () => root.render(<Harness setId={message.id} kind="scripture" />));

    const after = useLibrary.getState().sets[message.id].slides;
    expect(after.map((s) => s.lines)).toEqual([["For God"], ["so loved"]]);
    // Same slides, not regenerated ones: the seeded text reconciled to them.
    expect(after.map((s) => s.id)).toEqual(["v1", "v2"]);
  });

  it("opening a plain scripture seeds the box from its verses and writes nothing", async () => {
    const scripture = makeSet({ kind: "scripture", slides: verses });
    await db.sets.put(scripture);
    await useLibrary.getState().loadFromDb();
    const before = useLibrary.getState().sets[scripture.id].updatedAt;

    await act(async () => root.render(<Harness setId={scripture.id} kind="scripture" />));

    const after = useLibrary.getState().sets[scripture.id];
    expect(after.slides.map((s) => s.id)).toEqual(["v1", "v2"]);
    expect(after.updatedAt).toBe(before);
  });
});

describe("mergeHiddenVersions", () => {
  it("carries the hidden translation through a rebuild and keeps lines on the primary", () => {
    const current: Slide[] = [
      {
        id: "a",
        kind: "scripture",
        lines: ["For God"],
        linesByVersion: { NIV: "For God", CUNPS: "神愛世人" },
        referencesByVersion: { NIV: "John 3:16", CUNPS: "約翰福音 3:16" },
        reference: "John 3:16",
      },
    ];
    // The workspace shows CUNPS only; the user edited that box.
    const parsed: Slide[] = [
      {
        id: "b",
        kind: "scripture",
        lines: ["神爱世人（改）"],
        linesByVersion: { CUNPS: "神爱世人（改）" },
        referencesByVersion: { CUNPS: "約翰福音 3:16" },
        reference: "約翰福音 3:16",
      },
    ];
    const [merged] = mergeHiddenVersions(parsed, current, ["CUNPS"], "NIV");
    expect(merged.linesByVersion).toEqual({ NIV: "For God", CUNPS: "神爱世人（改）" });
    expect(merged.lines).toEqual(["For God"]);
    expect(merged.reference).toBe("John 3:16");
  });
});

describe("renameVersions", () => {
  it("swaps the version codes in an auto-named set and leaves custom names alone", async () => {
    const { renameVersions } = await import("@/hooks/use-scripture-versions");
    expect(renameVersions("John 3:16 NIV", "CUNPS", "")).toBe("John 3:16 CUNPS");
    expect(renameVersions("John 3:16 NIV / CUNPS", "ESV", "JPNICT")).toBe("John 3:16 ESV / JPNICT");
    expect(renameVersions("Psalms 100:4 NIV", "NIV", "KRV")).toBe("Psalms 100:4 NIV / KRV");
    expect(renameVersions("Sunday reading", "NIV", "KRV")).toBe("Sunday reading");
  });
});

describe("mergeHiddenVersions pairs by verse, not by position", () => {
  const bilingual = (): Slide[] =>
    ["1", "2", "3"].map((n) => ({
      id: `s${n}`,
      kind: "scripture",
      lines: [`en${n}`],
      linesByVersion: { NIV: `en${n}`, JCB: `ja${n}` },
      referencesByVersion: { NIV: "John 3:1-3", JCB: "ヨハネ 3:1-3" },
      reference: "John 3:1-3",
    }));
  const visible = (texts: string[]): Slide[] =>
    texts.map((t, i) => ({
      id: `p${i}`,
      kind: "scripture",
      lines: [t],
      linesByVersion: { NIV: t },
      referencesByVersion: { NIV: "John 3:1-3" },
      reference: "John 3:1-3",
    }));
  const pairs = (slides: Slide[]) =>
    slides.map((s) => [s.linesByVersion?.NIV, s.linesByVersion?.JCB]);

  it("a deleted verse takes its hidden text with it", () => {
    const merged = mergeHiddenVersions(visible(["en1", "en3"]), bilingual(), ["NIV"], "NIV");
    expect(pairs(merged)).toEqual([
      ["en1", "ja1"],
      ["en3", "ja3"],
    ]);
  });

  it("an edited verse keeps its own hidden text", () => {
    const merged = mergeHiddenVersions(
      visible(["en1", "en2 (edited)", "en3"]),
      bilingual(),
      ["NIV"],
      "NIV",
    );
    expect(pairs(merged)).toEqual([
      ["en1", "ja1"],
      ["en2 (edited)", "ja2"],
      ["en3", "ja3"],
    ]);
  });

  it("a merged verse keeps the first verse's hidden text and a new verse gets none", () => {
    const merged = mergeHiddenVersions(
      visible(["en1 en2", "en3", "en4 (new)"]),
      bilingual(),
      ["NIV"],
      "NIV",
    );
    expect(pairs(merged)).toEqual([
      ["en1 en2", "ja1"],
      ["en3", "ja3"],
      ["en4 (new)", undefined],
    ]);
  });
});

describe("pairByText", () => {
  it("matches identical texts in order and pairs the leftovers of each gap by position", async () => {
    const { pairByText } = await import("@/hooks/use-scripture-versions");
    expect(pairByText(["a", "c"], ["a", "b", "c"])).toEqual([0, 2]);
    expect(pairByText(["a", "x", "c"], ["a", "b", "c"])).toEqual([0, 1, 2]);
    expect(pairByText(["x", "y", "c"], ["b", "c"])).toEqual([0, -1, 1]);
    expect(pairByText(["", "b"], ["", "b"])).toEqual([0, 1]);
    expect(pairByText([], ["a"])).toEqual([]);
  });
});
