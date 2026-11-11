import { describe, expect, it } from "vitest";
import { pretty, reportLines, reportTitle } from "../src/lib/report.js";
import type { PeriodRow } from "../src/lib/winners.js";

const rows: PeriodRow[] = [
  { period: "Q1", state: "official", score: { top: 10, left: 3 }, block: { row: 8, col: 6 } },
  { period: "Half", state: "official", score: { top: 10, left: 13 }, block: { row: 7, col: 6 } },
  { period: "Q3", state: "in_progress", score: { top: 10, left: 16 }, block: { row: 5, col: 8 } },
  { period: "Final", state: "not_started" },
];

describe("report text", () => {
  it("title-cases shouted team names, leaves mixed case alone", () => {
    expect(pretty("EAGLES")).toBe("Eagles");
    expect(pretty("PHILA EAGLES")).toBe("Phila Eagles");
    expect(pretty("AFC - CHIEFS")).toBe("Afc - Chiefs");
    expect(pretty("Eagles")).toBe("Eagles");
    expect(pretty("49ers")).toBe("49ers");
  });
  it("title uses the game's date", () => {
    expect(reportTitle("EAGLES", "COMMANDERS", "2026-11-01T17:00:00Z")).toBe("Eagles vs Commanders, Nov 1, 2026");
  });
  it("lines use the sheet's own labels 1, 2, 3, F with a plain score, in the reference colours", () => {
    const l = reportLines(rows, new Set());
    expect(l[0]).toMatchObject({ label: "1", score: "10-3", wantsName: true, block: "8,6", note: "", color: "#d55e00" });
    expect(l[1]).toMatchObject({ label: "2", score: "10-13", color: "#0072b2" });
    expect(l[2]).toMatchObject({ label: "3", score: "10-16", note: "winning now, can change", color: "#00785a" });
    expect(l[3]).toMatchObject({ label: "F", score: "", note: "not started yet", wantsName: false, block: null, dim: true });
  });
  it("a block outside the photo says so and takes no name", () => {
    const l = reportLines(rows, new Set(["8,6"]));
    expect(l[0]!.wantsName).toBe(false);
    expect(l[0]!.block).toBeNull();
    expect(l[0]!.note).toMatch(/outside the photo/);
  });
});
