import { describe, expect, it } from "vitest";
import type { Quad } from "@bpc/engine";
import { PERIOD_COLOR, winnerBoxes } from "../src/lib/boxes.js";
import type { PeriodRow } from "../src/lib/winners.js";

const corners: Quad = [
  [100, 100],
  [1100, 100],
  [1100, 1100],
  [100, 1100],
]; // 100px blocks
const row = (period: PeriodRow["period"], r: number, c: number, state: PeriodRow["state"] = "official"): PeriodRow => ({
  period,
  state,
  block: { row: r, col: c },
});

describe("winnerBoxes", () => {
  it("one box per winner, in the reference colours; provisional ones are dashed", () => {
    const b = winnerBoxes([row("Q1", 8, 6), row("Half", 7, 6), row("Q3", 5, 8, "in_progress"), { period: "Final", state: "not_started" }], corners, new Set());
    expect(b.map((x) => [x.period, x.color, x.dashed])).toEqual([
      ["Q1", "#d55e00", false],
      ["Half", "#0072b2", false],
      ["Q3", "#00785a", true],
    ]);
    expect(b[0]!.quad[0]).toEqual([600, 800]); // row 8, col 6 -> x 100+5*100, y 100+7*100
    expect(PERIOD_COLOR.Final).toBe("#5b1a8c");
  });
  it("a block that wins twice gets nested outlines so both colours show", () => {
    const b = winnerBoxes([row("Q1", 3, 3), row("Final", 3, 3)], corners, new Set());
    expect(b).toHaveLength(2);
    expect(b[1]!.quad[0]![0]).toBeGreaterThan(b[0]!.quad[0]![0]);
    expect(b[1]!.quad[2]![0]).toBeLessThan(b[0]!.quad[2]![0]);
  });
  it("every box carries its period number, and boxes sharing a block are numbered side by side", () => {
    const b = winnerBoxes([row("Q1", 3, 3), row("Half", 4, 4), row("Final", 3, 3)], corners, new Set());
    expect(b.map((x) => [x.label, x.nest])).toEqual([
      ["1", 0],
      ["2", 0],
      ["F", 1],
    ]);
  });
  it("blocks outside the photo are not boxed", () => {
    expect(winnerBoxes([row("Q1", 2, 9)], corners, new Set(["2,9"]))).toEqual([]);
  });
});
