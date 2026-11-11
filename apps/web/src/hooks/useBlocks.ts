import { useMemo, useState } from "react";
import { blockQuad, pointToBlock, type Quad } from "@bpc/engine";
import { findBlocks } from "../lib/find";
import { similarBlocks } from "../lib/similar";
import type { Sheet } from "../lib/sheetApi";
import type { SheetEdit } from "./useSheetDoc";

export interface Highlight {
  quad: Quad;
  kind: "mine" | "match" | "maybe" | "sel";
}

/** The person's blocks: the name search, marked ("mine") blocks, the block open in the close-up panel, and what to outline on the photo. */
export function useBlocks(sheet: Sheet | null | undefined, edit: SheetEdit) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const names = sheet?.names;
  const corners = sheet?.corners;
  const mine = useMemo(() => new Set(sheet?.mine ?? []), [sheet?.mine]);
  const matches = useMemo(() => (names ? findBlocks(names, query) : []), [names, query]);
  const maybes = useMemo(() => (names ? similarBlocks(names, query, matches) : []), [names, query, matches]);
  const highlights = useMemo<Highlight[]>(() => {
    if (!corners) return [];
    const quad = (k: string) => {
      const [r, c] = k.split(",").map(Number) as [number, number];
      return blockQuad(corners, r, c);
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
    const c = pointToBlock(sheet.corners, p);
    if (c) setSelected(`${c.row},${c.col}`);
  };

  return { query, setQuery, selected, setSelected, mine, matches, maybes, highlights, toggleMine, markAll, clearMine, setName, setNames, tapPhoto };
}
