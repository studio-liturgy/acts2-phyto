/**
 * One place for haptic feedback, so calls added in the web code light up in
 * the phyto app without further changes.
 *
 * - phyto app (iOS and Android): Capacitor's Haptics plugin, reached through
 *   the bridge Capacitor injects into the page (`window.Capacitor.Plugins`).
 * - Android browsers: `navigator.vibrate` with a short pulse.
 * - iOS Safari and computers: nothing (no web API for it).
 *
 * Which actions get which feel is still his pick; nothing calls this yet.
 */

export type HapticKind = "tap" | "select" | "success" | "warning";

type HapticsPlugin = {
  impact?: (o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
  notification?: (o: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
};

type CapacitorGlobal = { Plugins?: { Haptics?: HapticsPlugin } };

/** Milliseconds of `navigator.vibrate` per kind (Android browsers). */
export const VIBRATE_MS: Record<HapticKind, number | number[]> = {
  tap: 10,
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
      const done =
        kind === "select"
          ? h.selectionChanged?.()
          : kind === "success" || kind === "warning"
            ? h.notification?.({ type: kind === "success" ? "SUCCESS" : "WARNING" })
            : h.impact?.({ style: "LIGHT" });
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
