import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, USER_ID } from "@/test/fixtures";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import {
  DEFAULT_WORKSPACE_SETTINGS,
  fetchWorkspaceSettings,
  saveWorkspaceSettings,
} from "@/lib/workspace-settings";
import { useAuthStore } from "@/lib/authStore";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  supabaseMock.configure({ session: fakeSession, tables: { workspace_settings: [] } });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
});

describe("fetchWorkspaceSettings", () => {
  it("returns the defaults when the scope has no row yet", async () => {
    expect(await fetchWorkspaceSettings({ groupId: null })).toEqual(DEFAULT_WORKSPACE_SETTINGS);
    expect(await fetchWorkspaceSettings({ groupId: GROUP_ID })).toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("reads the personal row and the group row separately", async () => {
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        workspace_settings: [
          { id: "p", user_id: USER_ID, group_id: null, multi_language: true, language: "ja" },
          { id: "g", user_id: null, group_id: GROUP_ID, multi_language: false, language: "fr" },
        ],
      },
    });
    expect(await fetchWorkspaceSettings({ groupId: null })).toEqual({
      multiLanguage: true,
      language: "ja",
    });
    expect(await fetchWorkspaceSettings({ groupId: GROUP_ID })).toEqual({
      multiLanguage: false,
      language: "fr",
    });
  });

  it("falls back to English for an unknown language code", async () => {
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        workspace_settings: [
          { id: "p", user_id: USER_ID, group_id: null, multi_language: false, language: "xx" },
        ],
      },
    });
    expect((await fetchWorkspaceSettings({ groupId: null }))?.language).toBe("en");
  });

  it("returns null (unknown) on a read error, so callers keep what they have", async () => {
    supabaseMock.configure({
      session: fakeSession,
      errors: [{ table: "workspace_settings", op: "select", error: { message: "boom" } }],
    });
    expect(await fetchWorkspaceSettings({ groupId: null })).toBeNull();
  });
});

describe("saveWorkspaceSettings", () => {
  it("inserts a personal row on first use, then updates it", async () => {
    expect(await saveWorkspaceSettings({ groupId: null }, { multiLanguage: true })).toBe(true);
    const rows = supabaseMock.tables.workspace_settings;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: USER_ID, multi_language: true });

    expect(await saveWorkspaceSettings({ groupId: null }, { language: "ko" })).toBe(true);
    expect(supabaseMock.tables.workspace_settings).toHaveLength(1);
    expect(supabaseMock.tables.workspace_settings[0]).toMatchObject({
      multi_language: true,
      language: "ko",
    });
  });

  it("keys a group row by group_id", async () => {
    expect(await saveWorkspaceSettings({ groupId: GROUP_ID }, { language: "zh-Hans" })).toBe(true);
    expect(supabaseMock.tables.workspace_settings[0]).toMatchObject({
      group_id: GROUP_ID,
      language: "zh-Hans",
    });
  });

  it("reports false when the write is refused", async () => {
    supabaseMock.configure({
      session: fakeSession,
      tables: { workspace_settings: [] },
      errors: [{ table: "workspace_settings", op: "insert", error: { code: "42501" } }],
    });
    expect(await saveWorkspaceSettings({ groupId: GROUP_ID }, { multiLanguage: true })).toBe(false);
  });
});
