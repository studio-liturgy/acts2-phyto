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
