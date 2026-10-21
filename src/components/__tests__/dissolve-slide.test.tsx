import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DissolveSlide } from "@/components/SlideView";
import type { Slide } from "@/lib/types";

// The front layer is the one at full opacity; the other is fading or hidden.
function frontText(host: HTMLElement): string {
  const layers = [...host.querySelectorAll<HTMLElement>(".isolate > div")];
  const front = layers.find((l) => l.style.opacity === "1");
  return front?.textContent ?? "";
}

// jsdom has no ResizeObserver; SlideView only uses it to fit text.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const slide = (lines: string[]): Slide => ({ id: "x", kind: "lyric", lines });

describe("DissolveSlide", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });
  const show = (s: Slide | null, template?: { fontScale?: number }, refreshKey?: number) =>
    act(() =>
      root.render(
        <DissolveSlide
          slide={s}
          variant="preview"
          durationMs={500}
          template={template}
          refreshKey={refreshKey}
        />,
      ),
    );

  it("bug report: after a reload the live slide shows, even when the set loads in bursts", () => {
    // Reload: live state is restored before the sets have loaded.
    show(null);
    expect(frontText(host)).toContain("No slide selected");
    // The sets arrive, then a sync hands over the same slide as a new object
    // before the dissolve has swapped.
    show(slide(["Amazing grace"]));
    show(slide(["Amazing grace"]));
    act(() => vi.advanceTimersByTime(300));
    expect(frontText(host)).toContain("Amazing grace");
  });

  it("clicking the live slide again dissolves to the new template", () => {
    show(slide(["Amazing grace"]), { fontScale: 1 }, 0);
    act(() => vi.advanceTimersByTime(300));
    show(slide(["Amazing grace"]), { fontScale: 2 }, 0);
    const layers = () => [...host.querySelectorAll<HTMLElement>(".isolate > div")];
    // Not applied before the click.
    expect(layers().filter((l) => l.textContent?.includes("Amazing grace")).length).toBe(1);
    show(slide(["Amazing grace"]), { fontScale: 2 }, 1);
    // Both layers hold the slide: the old look fading off the new one.
    expect(layers().filter((l) => l.textContent?.includes("Amazing grace")).length).toBe(2);
    act(() => vi.advanceTimersByTime(300));
    const back = layers().find((l) => l.style.opacity === "0");
    expect(back?.style.transition).toContain("500ms");
  });

  it("clicking again with nothing changed does nothing", () => {
    show(slide(["Amazing grace"]), { fontScale: 1 }, 0);
    act(() => vi.advanceTimersByTime(300));
    const before = host.innerHTML;
    show(slide(["Amazing grace"]), { fontScale: 1 }, 1);
    act(() => vi.advanceTimersByTime(300));
    expect(host.innerHTML).toBe(before);
  });
});
