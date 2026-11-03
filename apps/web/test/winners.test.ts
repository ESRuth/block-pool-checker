import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScoreSnapshot } from "@bpc/engine";
import { computeWinners } from "../src/lib/winners.js";
import { rowsToDigits } from "../src/lib/digits.js";

const fixture = JSON.parse(readFileSync(new URL("../../../packages/engine/fixtures/eagles_commanders_2026.json", import.meta.url), "utf8"));
const rows = Object.fromEntries(
  (["Q1", "Half", "Q3", "Final"] as const).flatMap((p) => (["top", "left"] as const).map((ax) => [`${p}.${ax}`, fixture.digits[p][ax].join("")])),
);
const digits = rowsToDigits(rows, "per_period")!;

const team = (abbr: string, name: string, nickname: string, location: string) => ({ abbr, name, nickname, location });
const WSH = team("WSH", "Washington Commanders", "Commanders", "Washington"),
  PHI = team("PHI", "Philadelphia Eagles", "Eagles", "Philadelphia");
// Real game: PHI @ WSH. Cumulative PHI 10-10-10-10, WSH 3-13-16-27 (the owner's golden example).
const snap = (over: Partial<ScoreSnapshot> = {}): ScoreSnapshot => ({
  gameId: "401873035",
  league: "nfl",
  source: "espn",
  fetchedAt: "2026-11-02T12:00:00.000Z",
  status: "final",
  statusDetail: "Final",
  home: WSH,
  away: PHI,
  periods: { home: [3, 10, 3, 11], away: [10, 0, 0, 0] },
  total: { home: 27, away: 10 },
  ...over,
});

describe("computeWinners", () => {
  it("reproduces the golden Eagles-Commanders winners", () => {
    const r = computeWinners(snap(), "EAGLES", "COMMANDERS", digits, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.period, x.state, x.score, x.cell])).toEqual([
      ["Q1", "official", { top: 10, left: 3 }, { row: 8, col: 6 }],
      ["Half", "official", { top: 10, left: 13 }, { row: 7, col: 6 }],
      ["Q3", "official", { top: 10, left: 16 }, { row: 5, col: 8 }],
      ["Final", "official", { top: 10, left: 27 }, { row: 3, col: 9 }],
    ]);
    expect(r.rows[3]!.ending).toEqual({ top: 0, left: 7 });
  });
  it("works with the sheet's orientation swapped and with verbatim sheet text", () => {
    const swapped = computeWinners(snap(), "PHILA EAGLES", "Commanders", digits, true);
    expect(swapped.ok).toBe(true);
  });
  it("mid-game: Q1 and Half official, Q3 provisional (currently winning), Final not started", () => {
    const live = snap({ status: "in_progress", periods: { home: [3, 10, 3], away: [10, 0, 0] }, total: { home: 16, away: 10 } });
    const r = computeWinners(live, "EAGLES", "COMMANDERS", digits, true);
    expect(r.ok && r.rows.map((x) => x.state)).toEqual(["official", "official", "in_progress", "not_started"]);
    expect(r.ok && r.rows[2]!.cell).toEqual({ row: 5, col: 8 }); // same square as when it ends 10-16
    expect(r.ok && r.rows[3]!.cell).toBeUndefined();
  });
  it("overtime setting changes Final", () => {
    const ot = snap({ periods: { home: [3, 10, 3, 11, 0], away: [10, 0, 0, 0, 3] }, total: { home: 27, away: 13 } });
    const withOt = computeWinners(ot, "EAGLES", "COMMANDERS", digits, true);
    const reg = computeWinners(ot, "EAGLES", "COMMANDERS", digits, false);
    expect(withOt.ok && withOt.rows[3]!.score).toEqual({ top: 13, left: 27 });
    expect(reg.ok && reg.rows[3]!.score).toEqual({ top: 10, left: 27 });
  });
  it("not started: no winners", () => {
    const pre = snap({ status: "scheduled", periods: { home: [], away: [] }, total: { home: 0, away: 0 } });
    const r = computeWinners(pre, "EAGLES", "COMMANDERS", digits, true);
    expect(r.ok && r.rows.every((x) => x.state === "not_started" && !x.cell)).toBe(true);
  });
  it("refuses when the sheet's teams are not the game's teams", () => {
    const r = computeWinners(snap(), "PATRIOTS", "RAMS", digits, true);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/don't match this game/);
  });
});

describe("rowsToDigits", () => {
  it("null when any row is bad", () => {
    expect(rowsToDigits({ ...rows, "Q1.top": "1123456789" }, "per_period")).toBeNull();
    expect(rowsToDigits({ "shared.top": "0123456789", "shared.left": "9876543210" }, "shared")).toEqual({
      shared: { top: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], left: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
    });
  });
});
