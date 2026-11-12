import type { SetKind } from "./types";

/** The live colour of a set's kind: the live slide's border in the presenter
 *  (light mode; dark mode uses the foreground) and the live dot. */
export function kindLiveColor(kind: SetKind): string {
  if (kind === "song") return "var(--brand-blue)";
  if (kind === "scripture") return "var(--brand-green)";
  if (kind === "message") return "var(--brand-green-dark)";
  if (kind === "media") return "var(--brand-orange)";
  return "var(--brand-red)";
}
