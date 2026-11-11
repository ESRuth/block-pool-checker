import type { NameEntry } from "./sheetApi";

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * Blocks whose name matches the search: every typed word must start a word in the name ("sam" finds "Sam Lee" and "Pat + Sam")
 * or appear inside it. Exact words only, no guessing at misspellings: a missed block is fixed by tapping it on the photo.
 */
export function findBlocks(names: Record<string, NameEntry>, query: string): string[] {
  const q = words(query);
  if (q.length === 0) return [];
  return Object.entries(names)
    .filter(([, n]) => {
      const w = words(n.text);
      const flat = w.join(" ");
      return w.length > 0 && q.every((t) => w.some((x) => x.startsWith(t)) || (t.length >= 3 && flat.includes(t)));
    })
    .map(([k]) => k)
    .sort((a, b) => {
      const [ar, ac] = a.split(",").map(Number) as [number, number],
        [br, bc] = b.split(",").map(Number) as [number, number];
      return ar - br || ac - bc;
    });
}
