import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, USER_ID } from "@/test/fixtures";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  BACKGROUND_KEY,
  DEFAULT_BACKGROUND,
  fetchAccountBackground,
  parseBackground,
  readLocalBackground,
  saveAccountBackground,
} from "@/lib/background";
import { useAuthStore } from "@/lib/authStore";

beforeEach(() => {
  localStorage.clear();
  supabaseMock.configure({ session: fakeSession, tables: { workspace_settings: [] } });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
});

describe("parseBackground", () => {
  it("keeps what it knows and drops the rest", () => {
    expect(
      parseBackground({ bg: "white", bgDim: 55, bgImage: "https://x/y.jpg", aspect: "4:3", z: 1 }),
    ).toEqual({ bg: "white", bgDim: 55, bgImage: "https://x/y.jpg", aspect: "4:3" });
  });

  it("clamps dim and ignores an unknown shape", () => {
    expect(parseBackground({ bg: "black", bgDim: 300, aspect: "5:4" })).toEqual({
      bg: "black",
      bgDim: 90,
    });
  });

  it("is null for nothing stored", () => {
    expect(parseBackground(null)).toBeNull();
    expect(parseBackground("black")).toBeNull();
  });
});

describe("readLocalBackground", () => {
  it("carries the song template's old White over before one is saved", () => {
    expect(readLocalBackground({ bg: "white" })).toEqual({ ...DEFAULT_BACKGROUND, bg: "white" });
    expect(readLocalBackground()).toEqual(DEFAULT_BACKGROUND);
  });

  it("prefers the saved one", () => {
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify({ bg: "black", bgDim: 20 }));
    expect(readLocalBackground({ bg: "white" })).toEqual({ bg: "black", bgDim: 20 });
  });
});

describe("account background", () => {
  it("reads null when the account has none", async () => {
    expect(await fetchAccountBackground()).toEqual({ background: null });
  });

  it("inserts the personal row on first save, then reads it back", async () => {
    const b = { bg: "white" as const, bgDim: 30, aspect: "16:10" as const };
    expect(await saveAccountBackground(b)).toBe(true);
    expect(await fetchAccountBackground()).toEqual({ background: b });
  });

  it("updates the existing personal row, not a group row", async () => {
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        workspace_settings: [
          { id: "p", user_id: USER_ID, group_id: null, background: null },
          { id: "g", user_id: null, group_id: "grp", background: { bg: "white", bgDim: 0 } },
        ],
      },
    });
    expect(await fetchAccountBackground()).toEqual({ background: null });
    expect(await saveAccountBackground({ bg: "black", bgDim: 60 })).toBe(true);
    expect(await fetchAccountBackground()).toEqual({ background: { bg: "black", bgDim: 60 } });
  });

  it("reads nothing signed out", async () => {
    useAuthStore.setState({ session: null, isLoading: false });
    expect(await fetchAccountBackground()).toBeNull();
    expect(await saveAccountBackground(DEFAULT_BACKGROUND)).toBe(false);
  });
});
