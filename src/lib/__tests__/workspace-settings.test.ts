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
    expect(await fetchWorkspaceSettings({ groupId: null })).toEqual({
      settings: DEFAULT_WORKSPACE_SETTINGS,
      exists: false,
    });
    expect(await fetchWorkspaceSettings({ groupId: GROUP_ID })).toEqual({
      settings: DEFAULT_WORKSPACE_SETTINGS,
      exists: false,
    });
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
      settings: { multiLanguage: true, language: "ja" },
      exists: true,
    });
    expect(await fetchWorkspaceSettings({ groupId: GROUP_ID })).toEqual({
      settings: { multiLanguage: false, language: "fr" },
      exists: true,
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
    expect((await fetchWorkspaceSettings({ groupId: null }))?.settings.language).toBe("en");
  });

  it("signed out, the personal scope reads the device copy", async () => {
    useAuthStore.setState({ session: null, isLoading: false });
    localStorage.setItem(
      "workspace-settings-personal-v1",
      JSON.stringify({ multiLanguage: true, language: "es" }),
    );
    expect(await fetchWorkspaceSettings({ groupId: null })).toEqual({
      settings: { multiLanguage: true, language: "es" },
      exists: false,
    });
    expect(supabaseMock.callsFor("workspace_settings", "select")).toHaveLength(0);
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

describe("store: personal settings across sign-in", () => {
  it("carries a signed-out choice up to the account when it has no row yet", async () => {
    const { useLibrary } = await import("@/lib/store");
    useAuthStore.setState({ session: null, isLoading: false });
    useLibrary.setState({ activeWorkspace: "personal" });

    // Signed out: the change lands on the device only.
    expect(await useLibrary.getState().updateWorkspaceSettings({ language: "ko" })).toBe(true);
    expect(supabaseMock.tables.workspace_settings).toHaveLength(0);
    expect(
      JSON.parse(localStorage.getItem("workspace-settings-personal-v1") ?? "{}"),
    ).toMatchObject({ language: "ko" });

    // Sign in with no account row: the device's choice becomes the account's.
    useAuthStore.setState({ session: fakeSession, isLoading: false });
    await useLibrary.getState().refreshWorkspaceSettings();
    expect(useLibrary.getState().workspaceSettings.language).toBe("ko");
    expect(supabaseMock.tables.workspace_settings[0]).toMatchObject({
      user_id: USER_ID,
      language: "ko",
    });
  });

  it("mirrors the account row over the device copy once one exists", async () => {
    const { useLibrary } = await import("@/lib/store");
    supabaseMock.configure({
      session: fakeSession,
      tables: {
        workspace_settings: [
          { id: "p", user_id: USER_ID, group_id: null, multi_language: true, language: "ja" },
        ],
      },
    });
    localStorage.setItem(
      "workspace-settings-personal-v1",
      JSON.stringify({ multiLanguage: false, language: "es" }),
    );
    useLibrary.setState({ activeWorkspace: "personal" });

    await useLibrary.getState().refreshWorkspaceSettings();

    expect(useLibrary.getState().workspaceSettings).toEqual({
      multiLanguage: true,
      language: "ja",
    });
    expect(JSON.parse(localStorage.getItem("workspace-settings-personal-v1") ?? "{}")).toEqual({
      multiLanguage: true,
      language: "ja",
    });
  });
});
