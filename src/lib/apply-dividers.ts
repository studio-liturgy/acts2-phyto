import { isChordOnlyLine } from "@/lib/chords";

// Strips existing --- lines, then re-inserts --- every linesPer non-empty lines,
// preserving empty lines in their original positions.
//
// The strip has to remove those lines outright, not blank them: replacing
// "---" with "" left an empty array entry that the loop below then treats as
// a genuine stanza break, forcing a group boundary right back at the OLD
// divider's position regardless of the new linesPer. That made every divide
// after the first a no-op — re-running this on already-divided text (which
// picking a search result already produces once) never actually moved
// anything.
export function applyDividers(text: string, linesPer: number): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "---");
  const out: string[] = [];
  let countInGroup = 0;

  const endGroup = () => {
    if (countInGroup > 0) {
      out.push("---");
      countInGroup = 0;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      endGroup(); // stanza break → end slide cleanly, drop the blank line
      continue;
    }
    if (/^\[.+\]$/.test(line)) {
      endGroup(); // section header ends the previous group, doesn't count
      out.push(line);
      continue;
    }
    if (isChordOnlyLine(line)) {
      // An instrumental line projects nothing, so it isn't a lyric line —
      // it rides along with the current slide without using up its quota.
      out.push(line);
      continue;
    }
    if (countInGroup > 0 && countInGroup % linesPer === 0) {
      out.push("---");
    }
    out.push(line);
    countInGroup++;
  }

  while (out.length > 0 && out[out.length - 1] === "---") out.pop();
  return out.join("\n");
}
