import { describe, expect, it } from "vitest";
import { holdDelay, moveRunEnd, runFrom } from "../line-select";

describe("holdDelay", () => {
  it("is longer while a line is being typed in, so taps between lines stay taps", () => {
    expect(holdDelay()).toBe(500);
    const box = document.createElement("textarea");
    document.body.appendChild(box);
    box.focus();
    expect(holdDelay()).toBe(700);
    box.remove();
  });
});

describe("line runs on a phone", () => {
  it("held line to the line under the finger, either way", () => {
    expect(runFrom(4, 7)).toEqual({ from: 4, to: 7 });
    expect(runFrom(4, 1)).toEqual({ from: 1, to: 4 });
    expect(runFrom(4, 4)).toEqual({ from: 4, to: 4 });
  });

  it("dragging the bottom handle grows or shrinks the run from below", () => {
    expect(moveRunEnd({ from: 2, to: 5 }, "end", 8)).toEqual({ from: 2, to: 8 });
    expect(moveRunEnd({ from: 2, to: 5 }, "end", 3)).toEqual({ from: 2, to: 3 });
  });

  it("dragging the top handle moves the start", () => {
    expect(moveRunEnd({ from: 2, to: 5 }, "start", 0)).toEqual({ from: 0, to: 5 });
    expect(moveRunEnd({ from: 2, to: 5 }, "start", 4)).toEqual({ from: 4, to: 5 });
  });

  it("an end dragged past the other flips the run instead of emptying it", () => {
    expect(moveRunEnd({ from: 2, to: 5 }, "start", 9)).toEqual({ from: 5, to: 9 });
    expect(moveRunEnd({ from: 2, to: 5 }, "end", 0)).toEqual({ from: 0, to: 2 });
  });
});
