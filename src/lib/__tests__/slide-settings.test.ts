import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, USER_ID } from "@/test/fixtures";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  DEFAULT_SCRIPTURE_TEMPLATE,
  DEFAULT_SONG_TEMPLATE,
  fetchAccountSlideSettings,
  parseFadeMs,
  parseTemplate,
  planSlideSettingsSync,
  saveAccountSlideSettings,
  sameTemplate,
} from "@/lib/slide-settings";
import { useAuthStore } from "@/lib/authStore";

const local = {
  songTemplate: { ...DEFAULT_SONG_TEMPLATE },
  scriptureTemplate: { ...DEFAULT_SCRIPTURE_TEMPLATE },
  fadeMs: 0,
};
const none = { songTemplate: null, scriptureTemplate: null, fadeMs: null };

beforeEach(() => {
  supabaseMock.configure({ session: fakeSession, tables: { workspace_settings: [] } });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
});

describe("parseTemplate / parseFadeMs", () => {
  it("keeps what it knows and drops the rest", () => {
    expect(parseTemplate({ fontScale: 1.4, textCase: "upper", align: "sideways", z: 1 })).toEqual({
      fontScale: 1.4,
      textCase: "upper",
    });
    expect(parseTemplate(null)).toBeNull();
    expect(parseTemplate([1])).toBeNull();
  });

  it("reads a fade time, never negative", () => {
    expect(parseFadeMs(450)).toBe(450);
    expect(parseFadeMs(-5)).toBe(0);
    expect(parseFadeMs(null)).toBeNull();
    expect(parseFadeMs("300")).toBeNull();
  });

  it("compares templates by their known fields only", () => {
    expect(sameTemplate({ fontScale: 1 }, { fontScale: 1, extra: 2 } as never)).toBe(true);
    expect(sameTemplate({ fontScale: 1 }, { fontScale: 1.2 })).toBe(false);
  });
});

describe("planSlideSettingsSync", () => {
  it("first device with a real choice claims an empty account", () => {
    const mine = {
      ...local,
      songTemplate: { ...DEFAULT_SONG_TEMPLATE, textCase: "upper" as const },
    };
    expect(planSlideSettingsSync(none, mine)).toEqual({
      adopt: {},
      upload: { songTemplate: mine.songTemplate },
    });
  });

  it("a device still on defaults uploads nothing", () => {
    expect(planSlideSettingsSync(none, local)).toEqual({ adopt: {}, upload: {} });
  });

  it("adopts the account's values where they differ", () => {
    const scripture = { ...DEFAULT_SCRIPTURE_TEMPLATE, align: "center" as const };
    const fetched = {
      songTemplate: { ...DEFAULT_SONG_TEMPLATE },
      scriptureTemplate: scripture,
      fadeMs: 600,
    };
    expect(planSlideSettingsSync(fetched, local)).toEqual({
      adopt: { scriptureTemplate: scripture, fadeMs: 600 },
      upload: {},
    });
  });

  it("an account value wins over this device's own choice", () => {
    const mine = { ...local, fadeMs: 300 };
    expect(planSlideSettingsSync({ ...none, fadeMs: 0 }, mine)).toEqual({
      adopt: { fadeMs: 0 },
      upload: {},
    });
  });
});

describe("account slide settings", () => {
  it("reads nulls when the account has none", async () => {
    expect(await fetchAccountSlideSettings()).toEqual(none);
  });

  it("inserts the personal row, then updates only the fields passed", async () => {
    const song = { ...DEFAULT_SONG_TEMPLATE, fontScale: 1.3 };
    expect(await saveAccountSlideSettings({ songTemplate: song })).toBe(true);
    expect(await saveAccountSlideSettings({ fadeMs: 500 })).toBe(true);
    expect(await fetchAccountSlideSettings()).toEqual({
      songTemplate: song,
      scriptureTemplate: null,
      fadeMs: 500,
    });
  });

  it("writes the personal row, not a group row", async () => {
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        workspace_settings: [
          { id: "p", user_id: USER_ID, group_id: null },
          { id: "g", user_id: null, group_id: "grp", fade_ms: 900 },
        ],
      },
    });
    expect((await fetchAccountSlideSettings())?.fadeMs).toBeNull();
    expect(await saveAccountSlideSettings({ fadeMs: 200 })).toBe(true);
    expect((await fetchAccountSlideSettings())?.fadeMs).toBe(200);
  });

  it("does nothing signed out", async () => {
    useAuthStore.setState({ session: null, isLoading: false });
    expect(await fetchAccountSlideSettings()).toBeNull();
    expect(await saveAccountSlideSettings({ fadeMs: 1 })).toBe(false);
  });
});
