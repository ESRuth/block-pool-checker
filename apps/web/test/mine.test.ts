import { describe, expect, it } from "vitest";
import { cellAt, endingsFor, myWins, outlook } from "../src/lib/mine";
import type { PeriodRow } from "../src/lib/winners";

// Identity digits: column = top ending + 1, row = left ending + 1.
const id = Array.from({ length: 10 }, (_, i) => i);
const digits = { shared: { top: id, left: id } } as any;

describe("mine", () => {
  it("finds a square from a score and the endings a square needs", () => {
    expect(cellAt(digits, "Q1", 17, 3)).toBe("4,8"); // row = 3+1, col = 7+1
    expect(endingsFor(digits, "Q1", "4,8")).toEqual({ top: 7, left: 3 });
  });
  it("per-period digits are used for each period", () => {
    const rev = [...id].reverse();
    const d = { Q1: { top: id, left: id }, Half: { top: rev, left: rev }, Q3: { top: id, left: id }, Final: { top: id, left: id } } as any;
    expect(cellAt(d, "Half", 0, 0)).toBe("10,10");
    expect(endingsFor(d, "Half", "10,10")).toEqual({ top: 0, left: 0 });
  });
  it("lists the periods your squares win, official or currently leading", () => {
    const rows: PeriodRow[] = [
      { period: "Q1", state: "official", score: { top: 10, left: 3 }, cell: { row: 4, col: 1 } },
      { period: "Half", state: "official", score: { top: 10, left: 13 }, cell: { row: 4, col: 1 } },
      { period: "Q3", state: "in_progress", score: { top: 10, left: 16 }, cell: { row: 7, col: 1 } },
      { period: "Final", state: "not_started" },
    ];
    expect(myWins(rows, new Set(["4,1"]))).toEqual([
      { period: "Q1", score: { top: 10, left: 3 }, cell: "4,1", official: true },
      { period: "Half", score: { top: 10, left: 13 }, cell: "4,1", official: true },
    ]);
    expect(myWins(rows, new Set(["7,1"]))[0]).toMatchObject({ period: "Q3", official: false });
  });
  it("outlook: who leads now and who would lead after each single score, team with the ball first", () => {
    const rows: PeriodRow[] = [
      { period: "Q1", state: "official", score: { top: 7, left: 0 }, cell: { row: 1, col: 8 } },
      { period: "Half", state: "in_progress", score: { top: 7, left: 3 }, cell: { row: 4, col: 8 } },
      { period: "Q3", state: "not_started" },
      { period: "Final", state: "not_started" },
    ];
    // Half is being played at 7-3. Left field goal -> 7-6 = row 7, col 8. Top touchdown+XP -> 14-3 = row 4, col 5.
    const o = outlook(rows, digits)!;
    expect(o.period).toBe("Half");
    expect(o.leader).toBe("4,8");
    expect(o.ball).toBeUndefined();
    const pick = (t: string, p: string) => o.scenarios.find((s) => s.team === t && s.play === p)!;
    expect(pick("left", "a field goal").cell).toBe("7,8");
    expect(pick("top", "a touchdown and extra point").cell).toBe("4,5");
    expect(o.scenarios.filter((s) => s.common).map((s) => s.play)).toEqual(Array(2).fill(["a field goal", "a touchdown and extra point"]).flat());
    expect(o.scenarios.slice(0, 5).every((s) => s.team === "top")).toBe(true); // no ball info: top team first
    // With the left team holding the ball its scores come first.
    expect(
      outlook(rows, digits, "left")!
        .scenarios.slice(0, 5)
        .every((s) => s.team === "left"),
    ).toBe(true);
    expect(
      outlook(
        rows.map((r) => ({ ...r, state: r.state === "in_progress" ? "official" : r.state })),
        digits,
      ),
    ).toBeNull(); // nothing is being played: no outlook
  });
});
