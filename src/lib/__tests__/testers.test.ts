import { describe, expect, it } from "vitest";
import {
  checkTester,
  isOpenOnTest,
  PROD_ORIGIN,
  readVerifiedTester,
  shareOrigin,
  visitUrl,
  writeVerifiedTester,
  type TesterRpc,
} from "../testers";

describe("isOpenOnTest", () => {
  it("leaves sign in, its callback, legal pages and live links open", () => {
    for (const p of ["/login", "/auth/callback", "/legal", "/terms", "/privacy", "/g/abc"]) {
      expect(isOpenOnTest(p)).toBe(true);
    }
  });
  it("gates the app itself", () => {
    for (const p of ["/", "/present", "/output", "/set/123", "/s/xyz", "/updates", "/g"]) {
      expect(isOpenOnTest(p)).toBe(false);
    }
  });
});

describe("shareOrigin", () => {
  it("points phytoexp links at phyto.live", () => {
    expect(shareOrigin("https://phytoexp.live", true)).toBe(PROD_ORIGIN);
  });
  it("keeps the current site elsewhere", () => {
    expect(shareOrigin("https://phyto.live", false)).toBe("https://phyto.live");
    expect(shareOrigin("http://localhost:3000", false)).toBe("http://localhost:3000");
  });
});

describe("visitUrl", () => {
  it("opens a phyto.live link on phytoexp for testers", () => {
    expect(visitUrl("https://phyto.live/g/abc", "https://phytoexp.live", true)).toBe(
      "https://phytoexp.live/g/abc",
    );
  });
  it("leaves the link alone elsewhere or when empty", () => {
    expect(visitUrl("https://phyto.live/g/abc", "https://phyto.live", false)).toBe(
      "https://phyto.live/g/abc",
    );
    expect(visitUrl("", "https://phytoexp.live", true)).toBe("");
  });
});

describe("checkTester", () => {
  const rpcReturning =
    (data: unknown, error: unknown = null): TesterRpc =>
    async () => ({ data, error });

  it("passes the trimmed email and returns the list's answer", async () => {
    let sent = "";
    const rpc: TesterRpc = async (_fn, args) => {
      sent = args.p_email;
      return { data: true, error: null };
    };
    expect(await checkTester(rpc, "  A@B.com ")).toBe(true);
    expect(sent).toBe("A@B.com");
    expect(await checkTester(rpcReturning(false), "x@y.z")).toBe(false);
  });
  it("is false for an empty email without asking", async () => {
    expect(await checkTester(rpcReturning(true), "   ")).toBe(false);
  });
  it("is null (unknown) when the check fails, never false", async () => {
    expect(await checkTester(rpcReturning(null, { message: "offline" }), "a@b.c")).toBeNull();
    expect(await checkTester(rpcReturning("yes"), "a@b.c")).toBeNull();
    const throwing: TesterRpc = async () => {
      throw new Error("network");
    };
    expect(await checkTester(throwing, "a@b.c")).toBeNull();
  });
});

describe("verified tester cache", () => {
  it("round-trips and clears", () => {
    const m = new Map<string, string>();
    const s = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    expect(readVerifiedTester(s)).toBeNull();
    writeVerifiedTester(s, "u1");
    expect(readVerifiedTester(s)).toBe("u1");
    writeVerifiedTester(s, null);
    expect(readVerifiedTester(s)).toBeNull();
  });
});
