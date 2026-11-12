// Section pills on the remote: wrap them into as few rows as fit, then even
// the rows out so no pill sits alone on the last one when it can be helped
// (5 pills read 3 / 2, never 4 / 1).

/** Row lengths (pills per row, in order) for pills of `widths` with `gap`
 *  between them in `maxWidth`. Uses the fewest rows that fit, then the split
 *  whose widest row is narrowest; ties put more pills in earlier rows. */
export function balanceRows(widths: number[], gap: number, maxWidth: number): number[] {
  const n = widths.length;
  if (n === 0) return [];
  const rowWidth = (a: number, b: number) => {
    let w = 0;
    for (let i = a; i < b; i++) w += widths[i];
    return w + gap * (b - a - 1);
  };
  // The fewest rows: fill each row as far as it goes.
  let rows = 0;
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && rowWidth(i, j + 1) <= maxWidth) j++;
    rows++;
    i = j;
  }
  if (rows === 1) return [n];

  // Best split of pills [i, n) into r rows: its widest row, and the lengths.
  const memo = new Map<string, { worst: number; lengths: number[] }>();
  const best = (i: number, r: number): { worst: number; lengths: number[] } => {
    const key = `${i}:${r}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let out = { worst: Infinity, lengths: [] as number[] };
    if (r === 1) {
      out = { worst: rowWidth(i, n), lengths: [n - i] };
    } else {
      // Longest first row first, so ties keep the earlier rows fuller.
      for (let j = n - (r - 1); j > i; j--) {
        const first = rowWidth(i, j);
        if (first > maxWidth && j - i > 1) continue;
        const rest = best(j, r - 1);
        const worst = Math.max(first, rest.worst);
        if (worst < out.worst) out = { worst, lengths: [j - i, ...rest.lengths] };
      }
    }
    memo.set(key, out);
    return out;
  };
  return best(0, rows).lengths;
}

/**
 * The remote's section chips beside the edit circle (his rule): never one
 * chip per row for long. 1 = 1; 2 = 1 / 1; 3 = 2 / 1; 4 = 2 / 2; 5 = 3 / 2,
 * or 2 / 3 when the three won't fit side by side; more = balanced rows of
 * whatever fits (balanceRows).
 */
export function sectionRows(widths: number[], gap: number, maxWidth: number): number[] {
  const n = widths.length;
  if (n <= 1) return n ? [1] : [];
  if (n === 2) return [1, 1];
  if (n === 3) return [2, 1];
  if (n === 4) return [2, 2];
  const width = (a: number, b: number) =>
    widths.slice(a, b).reduce((x, y) => x + y, 0) + gap * (b - a - 1);
  if (n === 5) return width(0, 3) <= maxWidth || width(2, 5) > maxWidth ? [3, 2] : [2, 3];
  return balanceRows(widths, gap, maxWidth);
}
