import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "@/test/supabase-mock";
import { fakeSession, USER_ID } from "@/test/fixtures";

vi.mock("@/lib/supabase", async () => {
  const { supabaseMock } = await import("@/test/supabase-mock");
  return { supabase: supabaseMock.client };
});

import { gatheringSectionsReady, loadGatheringSections, useGatheringSections } from "@/lib/store";
import { useAuthStore } from "@/lib/authStore";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SONG = "song-1";

beforeEach(() => {
  sessionStorage.clear();
  useGatheringSections.setState({ hidden: {}, arranged: {}, loaded: {} });
  useAuthStore.setState({ session: fakeSession, isLoading: false });
  supabaseMock.configure({
    session: fakeSession,
    tables: {
      gatherings: [
        {
          id: A,
          user_id: USER_ID,
          hidden_sections: { [SONG]: ["Bridge#0"] },
          arrangements: { [SONG]: ["Verse 1#0", "Chorus#0", "Chorus#0"] },
        },
        // The same song in another gathering, with nothing set up.
        { id: B, user_id: USER_ID, hidden_sections: {}, arrangements: null },
      ],
    },
  });
});

describe("per-gathering section state", () => {
  it("keeps the same song's hides and arrangement apart in each gathering", async () => {
    await loadGatheringSections(A);
    await loadGatheringSections(B);
    const s = useGatheringSections.getState();
    expect(s.arranged[A][SONG]).toEqual(["Verse 1#0", "Chorus#0", "Chorus#0"]);
    expect(s.hidden[A][SONG]).toEqual(["Bridge#0"]);
    // B must not inherit A's setup for the song.
    expect(s.arranged[B][SONG]).toBeUndefined();
    expect(s.hidden[B][SONG]).toBeUndefined();
  });

  it("an edit in one gathering leaves the other alone", async () => {
    await loadGatheringSections(A);
    await loadGatheringSections(B);
    useGatheringSections.getState().setArrangement(B, SONG, ["Chorus#0"]);
    useGatheringSections.getState().setHidden(B, SONG, ["Verse 1#0"]);
    const s = useGatheringSections.getState();
    expect(s.arranged[A][SONG]).toEqual(["Verse 1#0", "Chorus#0", "Chorus#0"]);
    expect(s.hidden[A][SONG]).toEqual(["Bridge#0"]);
    expect(s.arranged[B][SONG]).toEqual(["Chorus#0"]);
  });

  it("isn't ready until the gathering's own state is in", async () => {
    expect(gatheringSectionsReady(useGatheringSections.getState(), A)).toBe(false);
    await loadGatheringSections(A);
    expect(gatheringSectionsReady(useGatheringSections.getState(), A)).toBe(true);
    expect(gatheringSectionsReady(useGatheringSections.getState(), B)).toBe(false);
  });

  it("is ready at once from the tab's own copy, and signed out", async () => {
    useGatheringSections.getState().setHidden(B, SONG, ["Verse 1#0"]);
    expect(gatheringSectionsReady(useGatheringSections.getState(), B)).toBe(true);
    useAuthStore.setState({ session: null, isLoading: false });
    await loadGatheringSections(A);
    expect(gatheringSectionsReady(useGatheringSections.getState(), A)).toBe(true);
  });
});
