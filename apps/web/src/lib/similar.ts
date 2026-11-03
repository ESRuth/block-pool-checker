import type { NameEntry } from "./sheetApi";

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Edit distance between two short words; swapping two neighbouring letters ("emli" for "emil") counts as one slip. */
export function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

/** How far a name word is from a typed word: compares the whole word and its same-length start ("emi" vs "emilia"). */
const wordDistance = (q: string, w: string) => Math.min(distance(q, w), q.length >= 3 ? distance(q, w.slice(0, q.length)) : 99);

/**
 * Squares whose name is CLOSE to the search but not a match, such as "Emol" for "emil". Only offered as suggestions
 * (never mixed into real matches): loose matching on its own added far more wrong squares than right ones.
 * One slip is allowed for short words, two for longer ones.
 */
export function similarCells(names: Record<string, NameEntry>, query: string, exact: string[], limit = 12): string[] {
  const q = words(query).filter((w) => w.length >= 3);
  if (q.length === 0) return [];
  const skip = new Set(exact);
  const scored: Array<[number, string]> = [];
  for (const [k, n] of Object.entries(names)) {
    if (skip.has(k)) continue;
    const w = words(n.text);
    if (w.length === 0) continue;
    const per = q.map((t) => Math.min(...w.map((x) => wordDistance(t, x))));
    const ok = per.every((p, i) => p <= (q[i]!.length >= 5 ? 2 : 1));
    if (ok) scored.push([per.reduce((s, p) => s + p, 0), k]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], undefined, { numeric: true }))
    .slice(0, limit)
    .map(([, k]) => k);
}
