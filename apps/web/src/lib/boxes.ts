import { cellQuad, type Period, type Quad } from "@bpc/engine";
import type { PeriodRow } from "./winners";

/**
 * Orange, blue, teal and deep purple: chosen to stay apart for people with red-green colour blindness (the original red and green did not).
 * Colour is never the only cue: every box also carries its period number (see `label`).
 */
export const PERIOD_COLOR: Record<Period, string> = { Q1: "#d55e00", Half: "#0072b2", Q3: "#00785a", Final: "#5b1a8c" };

/** The number printed on the sheet's digit rows for each period. */
export const PERIOD_LABEL: Record<Period, string> = { Q1: "1", Half: "2", Q3: "3", Final: "F" };

export interface Box {
  period: Period;
  /** 1, 2, 3 or F: drawn on the box so the period never depends on telling colours apart. */
  label: string;
  /** 0 for the first period to win this square, 1 for the next, and so on (tags are spaced out by this). */
  nest: number;
  quad: Quad;
  color: string;
  /** Provisional ("currently winning"): drawn dashed. */
  dashed: boolean;
}

const shrink = (q: Quad, k: number): Quad => {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4,
    cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map((p) => [cx + (p[0] - cx) * (1 - k), cy + (p[1] - cy) * (1 - k)]) as unknown as Quad;
};

/**
 * One coloured outline per winning period. If one square wins several periods the outlines nest,
 * each a little smaller, so every colour stays visible. Squares outside the photo get no box.
 */
export function winnerBoxes(rows: PeriodRow[], corners: Quad, outside: Set<string>): Box[] {
  const seen = new Map<string, number>();
  const boxes: Box[] = [];
  for (const r of rows) {
    if (!r.cell) continue;
    const key = `${r.cell.row},${r.cell.col}`;
    if (outside.has(key)) continue;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    boxes.push({
      period: r.period,
      label: PERIOD_LABEL[r.period],
      nest: k,
      quad: shrink(cellQuad(corners, r.cell.row, r.cell.col), 0.14 * k),
      color: PERIOD_COLOR[r.period],
      dashed: r.state === "in_progress",
    });
  }
  return boxes;
}
