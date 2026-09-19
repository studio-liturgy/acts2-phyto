import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { db } from "@/lib/db";
import { useLibrary } from "@/lib/store";
import { useScriptureLiveSync } from "@/hooks/use-scripture-live-sync";
import { resetDb } from "@/test/db-utils";
import { makeSet } from "@/test/fixtures";
import type { SetKind, Slide } from "@/lib/types";

// The Importers component seeds its verse box from the slides only when the
// set is already a scripture at mount; a message leaves it empty.
function Harness({ setId, kind }: { setId: string; kind: SetKind }) {
  const [manualText, setManualText] = useState("");
  useScriptureLiveSync({ kind, setId, manualText, setManualText, versesPer: 1 });
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

describe("useScriptureLiveSync", () => {
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

  it("still clears the slides when the user empties the box on a plain scripture", async () => {
    const scripture = makeSet({ kind: "scripture", slides: verses });
    await db.sets.put(scripture);
    await useLibrary.getState().loadFromDb();

    await act(async () => root.render(<Harness setId={scripture.id} kind="scripture" />));

    // Mounted as a scripture with an empty box: that IS the user's text, so the
    // ordinary sync applies (this mirrors the pre-existing behaviour, where the
    // real editor seeds the box from the slides before this hook first runs).
    expect(useLibrary.getState().sets[scripture.id].slides).toHaveLength(0);
  });
});
