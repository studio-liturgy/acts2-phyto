import type { SVGProps } from "react";

/** A remote control, drawn like the lucide icons beside it (lucide has none):
 *  the Present tab's Controls. */
export function RemoteIcon({
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <circle cx="12" cy="7.5" r="2" />
      <path d="M10 13h.01M14 13h.01M10 16.5h.01M14 16.5h.01" />
    </svg>
  );
}
