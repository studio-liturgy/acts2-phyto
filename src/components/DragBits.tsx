import type { CSSProperties } from "react";

/** 4-dot grip indicator matching the design mockups. */
export function DotsGrip({
  className = "",
  size = 14,
  style,
}: {
  className?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={style}
      fill="currentColor"
    >
      <circle cx="3.5" cy="3.5" r="1.2" />
      <circle cx="8.5" cy="3.5" r="1.2" />
      <circle cx="3.5" cy="8.5" r="1.2" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </svg>
  );
}
