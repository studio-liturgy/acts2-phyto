/**
 * One place for haptic feedback, so calls added in the web code light up in
 * the phyto app without further changes.
 *
 * - phyto app (iOS and Android): Capacitor's Haptics plugin, reached through
 *   the bridge Capacitor injects into the page (`window.Capacitor.Plugins`).
 * - Android browsers: `navigator.vibrate` with a short pulse.
 * - iOS Safari and computers: nothing (no web API for it).
 *
 * His picks (Nov 17): the remote is the most clicky (`firm`, a medium tap,
 * on every live change, Previous the same as Next), everything else is light,
 * and nothing makes a sound. Only the haptics engine is used (impact,
 * selection, notification); never the plugin's `vibrate`, which goes through
 * the system sound service.
 */

export type HapticKind = "tap" | "firm" | "select" | "success" | "warning";

type ImpactStyle = "LIGHT" | "MEDIUM" | "HEAVY";
type NotificationType = "SUCCESS" | "WARNING";

type HapticsPlugin = {
  impact?: (o: { style: ImpactStyle }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
  notification?: (o: { type: NotificationType | "ERROR" }) => Promise<void>;
};

type CapacitorGlobal = { Plugins?: { Haptics?: HapticsPlugin } };

/** The native feel per kind: an impact of a given weight, the picker tick,
 *  or a notification pattern. */
export const NATIVE_FEEL: Record<
  HapticKind,
  { impact: ImpactStyle } | { selection: true } | { notification: NotificationType }
> = {
  tap: { impact: "LIGHT" },
  firm: { impact: "MEDIUM" },
  select: { selection: true },
  success: { notification: "SUCCESS" },
  warning: { notification: "WARNING" },
};

/** Milliseconds of `navigator.vibrate` per kind (Android browsers). */
export const VIBRATE_MS: Record<HapticKind, number | number[]> = {
  tap: 10,
  firm: 20,
  select: 6,
  success: [12, 60, 12],
  warning: [24, 80, 24],
};

function plugin(): HapticsPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.Plugins?.Haptics ?? null;
}

/** Plays a haptic of the given kind where the device supports one. Never throws. */
export function haptic(kind: HapticKind = "tap"): void {
  try {
    const h = plugin();
    if (h) {
      const feel = NATIVE_FEEL[kind];
      const done =
        "impact" in feel
          ? h.impact?.({ style: feel.impact })
          : "selection" in feel
            ? h.selectionChanged?.()
            : h.notification?.({ type: feel.notification });
      void done?.catch(() => {});
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATE_MS[kind]);
    }
  } catch {
    // Haptics are a nicety; never break the action they decorate.
  }
}

/**
 * His rhythms (Nov 17), written as he wrote them: "-" a heavy tap, "." a
 * light one. Going live is dramatic but short; connecting and getting
 * disconnected (the remote's screen, or the TV when presenting from this
 * device) each have their own.
 */
export const RHYTHMS = {
  goLive: "-.-.-",
  connect: ".-.-",
  disconnect: "..-..-",
} as const;

export type RhythmName = keyof typeof RHYTHMS;

/** Gap after a beat (ms): a heavy beat holds a little longer than a light
 *  one, so the pattern reads as a rhythm rather than an even buzz. */
export const RHYTHM_GAP_MS = { heavy: 110, light: 70 } as const;

/** Android browsers: how long each beat vibrates (ms). */
export const RHYTHM_VIBRATE_MS = { heavy: 35, light: 12 } as const;

/** The beats of a rhythm: when each starts (ms from the first) and its weight. */
export function rhythmBeats(pattern: string): { at: number; heavy: boolean }[] {
  const beats: { at: number; heavy: boolean }[] = [];
  let at = 0;
  for (const ch of pattern) {
    if (ch !== "-" && ch !== ".") continue;
    const heavy = ch === "-";
    beats.push({ at, heavy });
    at += heavy ? RHYTHM_GAP_MS.heavy : RHYTHM_GAP_MS.light;
  }
  return beats;
}

/** `navigator.vibrate` pattern for a rhythm: on, off, on, ... */
export function rhythmVibration(pattern: string): number[] {
  const out: number[] = [];
  const beats = rhythmBeats(pattern);
  beats.forEach((b, i) => {
    const on = b.heavy ? RHYTHM_VIBRATE_MS.heavy : RHYTHM_VIBRATE_MS.light;
    out.push(on);
    const next = beats[i + 1];
    if (next) out.push(Math.max(0, next.at - b.at - on));
  });
  return out;
}

/** Plays one of his rhythms where the device supports haptics. Never throws. */
export function hapticRhythm(name: RhythmName): void {
  try {
    const pattern = RHYTHMS[name];
    const h = plugin();
    if (h) {
      for (const b of rhythmBeats(pattern)) {
        setTimeout(() => {
          void h.impact?.({ style: b.heavy ? "HEAVY" : "LIGHT" })?.catch(() => {});
        }, b.at);
      }
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(rhythmVibration(pattern));
    }
  } catch {
    // Never break the action it decorates.
  }
}
