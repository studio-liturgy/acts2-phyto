import { useEffect, useRef, useState } from "react";

/**
 * Smooth progress for a run of equal-ish steps (slides drawn one by one):
 * instead of jumping a step at a time, it keeps moving between updates at the
 * pace the steps have been taking, never passing the step in progress, and
 * eases onto each real count as it lands. Returns 0 to 1.
 */
export function useSmoothProgress(done: number, total: number, running: boolean): number {
  const [shown, setShown] = useState(0);
  const value = useRef(0);
  const lastDone = useRef(0);
  const lastAt = useRef(0);
  const perStep = useRef(400); // ms, until the first step is timed

  useEffect(() => {
    if (!running) {
      value.current = 0;
      lastDone.current = 0;
      lastAt.current = 0;
      perStep.current = 400;
      setShown(0);
      return;
    }
    const now = performance.now();
    if (done > lastDone.current) {
      if (lastAt.current > 0) {
        const took = (now - lastAt.current) / (done - lastDone.current);
        perStep.current = perStep.current * 0.6 + took * 0.4;
      }
      lastDone.current = done;
    }
    lastAt.current = now;
  }, [done, running]);

  useEffect(() => {
    if (!running || total <= 0) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const d = lastDone.current;
      // Where the run should be by now, held short of the next step.
      const ahead = Math.min(0.9, (now - lastAt.current) / perStep.current);
      const target = Math.min(total, d + (d < total ? ahead : 0)) / total;
      value.current += (target - value.current) * 0.15;
      setShown(value.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, total]);

  return shown;
}
