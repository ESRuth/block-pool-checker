import { useMemo, useState } from "react";
import { cellQuad, pointToCell, type Quad } from "@bpc/engine";
import { findCells } from "../lib/find";
import { similarCells } from "../lib/similar";
import type { Sheet } from "../lib/sheetApi";
import type { SheetEdit } from "./useSheetDoc";

export interface Highlight {
  quad: Quad;
  kind: "mine" | "match" | "maybe" | "sel";
}

/** The person's squares: the name search, marked ("mine") squares, the square open in the close-up panel, and what to outline on the photo. */
export function useSquares(sheet: Sheet | null | undefined, edit: SheetEdit) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const names = sheet?.names;
  const corners = sheet?.corners;
  const mine = useMemo(() => new Set(sheet?.mine ?? []), [sheet?.mine]);
  const matches = useMemo(() => (names ? findCells(names, query) : []), [names, query]);
  const maybes = useMemo(() => (names ? similarCells(names, query, matches) : []), [names, query, matches]);
  const highlights = useMemo<Highlight[]>(() => {
    if (!corners) return [];
    const quad = (k: string) => {
      const [r, c] = k.split(",").map(Number) as [number, number];
      return cellQuad(corners, r, c);
    };
    const out: Highlight[] = [...mine].map((k) => ({ quad: quad(k), kind: "mine" as const }));
    for (const k of matches) if (!mine.has(k)) out.push({ quad: quad(k), kind: "match" });
    for (const k of maybes) if (!mine.has(k)) out.push({ quad: quad(k), kind: "maybe" });
    if (selected) out.push({ quad: quad(selected), kind: "sel" });
    return out;
  }, [corners, mine, matches, maybes, selected]);

  const toggleMine = (k: string) => edit((s) => ({ ...s, mine: s.mine.includes(k) ? s.mine.filter((x) => x !== k) : [...s.mine, k] }));
  const markAll = (keys: string[]) => edit((s) => ({ ...s, mine: [...new Set([...s.mine, ...keys])] }));
  const clearMine = () => edit((s) => ({ ...s, mine: [] }));
  /** A person's word is final: a name set here is confirmed and never re-read. */
  const setName = (k: string, text: string) => edit((s) => ({ ...s, names: { ...s.names, [k]: { text, confirmed: true } } }));
  const setNames = (ks: string[], text: string) =>
    edit((s) => ({ ...s, names: { ...s.names, ...Object.fromEntries(ks.map((k) => [k, { text, confirmed: true }])) } }));
  const tapPhoto = (p: [number, number]) => {
    if (!sheet) return;
    const c = pointToCell(sheet.corners, p);
    if (c) setSelected(`${c.row},${c.col}`);
  };

  return { query, setQuery, selected, setSelected, mine, matches, maybes, highlights, toggleMine, markAll, clearMine, setName, setNames, tapPhoto };
}
