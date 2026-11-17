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
 * and nothing makes a sound. Taps use the haptics engine (impact, selection,
 * notification). The rhythms' dashes use the plugin's timed
 * `vibrate({ duration })`, which on iOS is a silent Core Haptics continuous
 * event; never call `vibrate()` without a duration (the plain system
 * vibration).
 */

export type HapticKind = "tap" | "firm" | "select" | "success" | "warning";

type ImpactStyle = "LIGHT" | "MEDIUM" | "HEAVY";
type NotificationType = "SUCCESS" | "WARNING";

type HapticsPlugin = {
  impact?: (o: { style: ImpactStyle }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
  notification?: (o: { type: NotificationType | "ERROR" }) => Promise<void>;
  vibrate?: (o: { duration: number }) => Promise<void>;
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
 * His rhythms (Nov 17), written as he wrote them. Each mark is its own
 * distinct beat, Morse-style (his note: the first, quick version "feels like
 * a cluster, not distinct dots and dashes"): "." is one sharp heavy tap, "-"
 * a held buzz, with a clear pause after each. Going live is dramatic but
 * short; connecting and getting disconnected (the remote's screen, or the TV
 * when presenting from this device) each have their own.
 */
export const RHYTHMS = {
  goLive: "-.-.-",
  connect: ".-.-",
  disconnect: "..-..-",
} as const;

export type RhythmName = keyof typeof RHYTHMS;

/** How long a dash buzzes (ms). A dot is an instant tap. */
export const RHYTHM_DASH_MS = 220;

/** The pause after every beat, before the next one starts (ms). */
export const RHYTHM_PAUSE_MS = 150;

/** Android browsers: a dot vibrates this long (ms). */
export const RHYTHM_DOT_VIBRATE_MS = 40;

/** The beats of a rhythm: when each starts (ms from the first), whether it
 *  is a dash, and how long it lasts (0 for an instant tap). */
export function rhythmBeats(pattern: string): { at: number; dash: boolean; ms: number }[] {
  const beats: { at: number; dash: boolean; ms: number }[] = [];
  let at = 0;
  for (const ch of pattern) {
    if (ch !== "-" && ch !== ".") continue;
    const dash = ch === "-";
    const ms = dash ? RHYTHM_DASH_MS : 0;
    beats.push({ at, dash, ms });
    at += ms + RHYTHM_PAUSE_MS;
  }
  return beats;
}

/** `navigator.vibrate` pattern for a rhythm: on, off, on, ... */
export function rhythmVibration(pattern: string): number[] {
  const out: number[] = [];
  const beats = rhythmBeats(pattern);
  beats.forEach((b, i) => {
    const on = b.dash ? b.ms : RHYTHM_DOT_VIBRATE_MS;
    out.push(on);
    const next = beats[i + 1];
    if (next) out.push(Math.max(0, next.at - b.at - on));
  });
  return out;
}

/** Plays one of his rhythms where the device supports haptics. Never throws.
 *  A dash is the plugin's timed `vibrate`, which on iOS is a Core Haptics
 *  continuous event (silent); a dot is a heavy impact. */
export function hapticRhythm(name: RhythmName): void {
  try {
    const pattern = RHYTHMS[name];
    const h = plugin();
    if (h) {
      for (const b of rhythmBeats(pattern)) {
        setTimeout(() => {
          const done =
            b.dash && h.vibrate ? h.vibrate({ duration: b.ms }) : h.impact?.({ style: "HEAVY" });
          void done?.catch(() => {});
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
