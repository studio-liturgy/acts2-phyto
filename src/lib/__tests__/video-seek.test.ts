import { describe, expect, it } from "vitest";
import { useLive } from "../store";
import { throttleLatest } from "../video-time";

describe("video playbar", () => {
  it("a seek keeps a playing video playing, a paused one paused", () => {
    useLive.getState().setLive({ videoCmd: { action: "play", nonce: 4 } });
    useLive.getState().seekVideo(30);
    expect(useLive.getState().videoCmd).toEqual({ action: "play", nonce: 5, seekTo: 30 });

    useLive.getState().setLive({ videoCmd: { action: "restart", nonce: 7 } });
    useLive.getState().seekVideo(-3);
    expect(useLive.getState().videoCmd).toEqual({ action: "play", nonce: 8, seekTo: 0 });

    useLive.getState().setLive({ videoCmd: { action: "stop", nonce: 1 } });
    useLive.getState().seekVideo(12);
    expect(useLive.getState().videoCmd?.action).toBe("pause");
  });

  it("reports at most once per interval, the latest winning", async () => {
    const sent: number[] = [];
    const send = throttleLatest((v: number) => sent.push(v), 30);
    send(1);
    send(2);
    send(3);
    expect(sent).toEqual([1]);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([1, 3]);
  });
});
