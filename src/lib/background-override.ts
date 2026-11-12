import { createContext } from "react";
import type { Background } from "./types";

/**
 * The Background slides are drawn on when it isn't this device's own: the
 * /screen page draws the remote's (Present from a phone). Everywhere else
 * it's absent and SlideView uses the store's Background.
 */
export const BackgroundOverride = createContext<Background | null>(null);
