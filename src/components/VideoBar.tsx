import { useMemo, useRef, useState } from "react";
import { TapRange } from "@/components/TapRange";
import { useLive } from "@/lib/store";
import { throttleLatest, useVideoTime } from "@/lib/video-time";

/**
 * The live video's playbar: the bar fills as it plays and the playhead can be
 * dragged (or the bar tapped) to jump. Its position comes from whatever is
 * playing the video (Stage Output, or the screen link for the remote).
 */
export function VideoBar({ slideId, className = "" }: { slideId: string; className?: string }) {
  const time = useVideoTime();
  const seekVideo = useLive((s) => s.seekVideo);
  const known = time.slideId === slideId && time.duration > 0;
  // While dragging, the playhead follows the finger, not the reports (which
  // lag a moment behind each jump).
  const [held, setHeld] = useState<number | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seek = useMemo(() => throttleLatest((v: number) => seekVideo(v), 250), [seekVideo]);
  const value = held ?? (known ? Math.min(time.current, time.duration) : 0);
  return (
    <TapRange
      min={0}
      max={known ? time.duration : 1}
      step={0.1}
      value={value}
      onValue={(v) => {
        if (!known) return;
        setHeld(v);
        seek(v);
        if (release.current) clearTimeout(release.current);
        release.current = setTimeout(() => setHeld(null), 1200);
      }}
      className={`w-full ${known ? "" : "pointer-events-none opacity-30"} ${className}`}
    />
  );
}
