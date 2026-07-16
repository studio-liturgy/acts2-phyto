/** Simple curtain icon — two draped panels with a top rod. */
export function CurtainIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* rod */}
      <line x1="3" y1="4" x2="21" y2="4" />
      {/* left panel */}
      <path d="M5 4 C 5 10, 7 14, 5 20 L 11 20 C 9 14, 11 10, 11 4 Z" />
      {/* right panel */}
      <path d="M13 4 C 13 10, 15 14, 13 20 L 19 20 C 17 14, 19 10, 19 4 Z" />
    </svg>
  );
}
