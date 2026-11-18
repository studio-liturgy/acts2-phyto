/**
 * The sign-in page's buttons on a phone, shared with the phone intro so the
 * two screens' buttons are the same width and size: the column is the screen
 * less 32px each side (`px-8`), at most 24rem (`max-w-sm`); each button runs
 * its full width, `py-3`, in the small mono (10px, stepped up to 11px on
 * phones by styles.css).
 */
export const PHONE_BTN_COLUMN_PAD = "px-8";
export const PHONE_BTN_COLUMN = "mx-auto w-full max-w-sm";
export const PHONE_BTN_TEXT = "text-[10px] tracking-wider";
export const PHONE_BTN = `mono uppercase w-full rounded-full px-6 py-3 text-center ${PHONE_BTN_TEXT}`;
