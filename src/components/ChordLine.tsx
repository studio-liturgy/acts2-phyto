import { Fragment, type CSSProperties } from "react";
import { parseChordLine, renderChord, toChordSegments, type SongChords } from "@/lib/chords";
import { ROLE_LABEL, isBoldRole, type Role } from "@/lib/song-roles";

interface Props {
  /** One raw lyric line, chords still inline: `Amazing (G)grace how (C)sweet`. */
  line: string;
  /** Written key + display mode. Absent means the song has no chords configured. */
  chords?: SongChords;
  /** Whether to show the chord row. When false the lyric renders on its own. */
  show?: boolean;
  className?: string;
  /** Styling for the chord row — callers set colour/weight to suit their surface. */
  chordClassName?: string;
  /** Inline chord-row style, for what a class can't override (e.g. a font-family
   *  set on an ancestor by the viewer's own font picker). */
  chordStyle?: CSSProperties;
  /** Call and Response: who reads this line (labelled; People and All bold). */
  role?: Role | null;
}

/**
 * Renders one lyric line, optionally with its chords floated above the words
 * they land on. Each word becomes an inline-block column so the chord stays
 * over its syllable, with real spaces between the columns so the line still
 * wraps normally on a narrow phone.
 *
 * Returns null for an instrumental (chord-only) line when chords are hidden —
 * there is nothing left to show.
 */
export function ChordLine({
  line,
  chords,
  show = false,
  className = "",
  chordClassName = "",
  chordStyle,
  role,
}: Props) {
  // Call and Response: the role label stays in front of the words, outside
  // the chord columns, and People and All lines are bold.
  const parsed = parseChordLine(line);
  const visible = show && !!chords && parsed.chords.length > 0;
  const lineClass = isBoldRole(role) ? `${className} font-bold` : className;
  const label = role ? <span className="font-normal">{ROLE_LABEL[role]}: </span> : null;

  if (!visible) {
    if (!parsed.text) return null;
    return (
      <p className={lineClass}>
        {label}
        {parsed.text}
      </p>
    );
  }

  const render = (c: string) => renderChord(c, chords);

  // Instrumental line — chords with no lyric under them.
  if (!parsed.text) {
    return (
      <p className={className}>
        <span className={chordClassName}>
          {parsed.chords.map((c) => render(c.chord)).join(" ")}
        </span>
      </p>
    );
  }

  return (
    <p className={lineClass}>
      {label && (
        <span className="inline-block align-bottom">
          <span className={`block leading-tight ${chordClassName}`} style={chordStyle}>
            {"\u00A0"}
          </span>
          <span className="block">{label}</span>
        </span>
      )}
      {toChordSegments(parsed, render).map((seg, i) => (
        <Fragment key={i}>
          <span className="inline-block align-bottom">
            {/* Explicit NBSP: keeps the empty chord row at full height so
                every word in the line shares one baseline. */}
            <span className={`block leading-tight ${chordClassName}`} style={chordStyle}>
              {seg.chord ?? "\u00A0"}
            </span>
            <span className="block">{seg.text || "\u00A0"}</span>
          </span>
          {seg.space ? " " : null}
        </Fragment>
      ))}
    </p>
  );
}
