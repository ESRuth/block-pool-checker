import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, PoolSettingsSchema, freshness, orientation, periodResults, toPoolScore, type ScoreSnapshot } from "../src/index.js";

const IND = { abbr: "IND", name: "Indianapolis Colts", nickname: "Colts", location: "Indianapolis" };
const ATL = { abbr: "ATL", name: "Atlanta Falcons", nickname: "Falcons", location: "Atlanta" };

// Real result: ATL @ IND (London), 2025-11-09, final in OT.
const ot: ScoreSnapshot = {
  gameId: "401772636",
  league: "nfl",
  source: "espn",
  fetchedAt: "2026-11-02T12:00:00.000Z",
  status: "final",
  statusDetail: "Final/OT",
  home: IND,
  away: ATL,
  periods: { home: [13, 0, 0, 12, 6], away: [7, 7, 3, 8, 0] },
  total: { home: 31, away: 25 },
};

describe("settings", () => {
  it("defaults: OT counts, payouts sum to 100", () => {
    expect(DEFAULT_SETTINGS.finalIncludesOvertime).toBe(true);
    expect(Object.values(DEFAULT_SETTINGS.payoutPercentages).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("rejects payouts over 100%", () => {
    expect(() => PoolSettingsSchema.parse({ payoutPercentages: { Q1: 50, Half: 50, Q3: 50, Final: 50 } })).toThrow();
  });
});

describe("periodResults", () => {
  it("final OT game: Final includes OT by default", () => {
    const r = periodResults(ot, DEFAULT_SETTINGS);
    expect(r.map((x) => x.state)).toEqual(["official", "official", "official", "official"]);
    expect(r[0]!.score).toEqual({ home: 13, away: 7 });
    expect(r[1]!.score).toEqual({ home: 13, away: 14 });
    expect(r[2]!.score).toEqual({ home: 13, away: 17 });
    expect(r[3]!.score).toEqual({ home: 31, away: 25 });
  });
  it("final OT game: end-of-regulation setting uses the 4th quarter score", () => {
    const r = periodResults(ot, { finalIncludesOvertime: false });
    expect(r[3]!.score).toEqual({ home: 25, away: 25 });
  });
  it("in progress during Q3 (synthetic): Q1/Half official, Q3 provisional, Final not started", () => {
    const live: ScoreSnapshot = { ...ot, status: "in_progress", periods: { home: [13, 0, 0], away: [7, 7, 3] }, total: { home: 13, away: 17 } };
    expect(periodResults(live, DEFAULT_SETTINGS).map((x) => x.state)).toEqual(["official", "official", "in_progress", "not_started"]);
  });
  it("halftime: Half is official", () => {
    const ht: ScoreSnapshot = { ...ot, status: "halftime", periods: { home: [13, 0], away: [7, 7] }, total: { home: 13, away: 14 } };
    expect(periodResults(ht, DEFAULT_SETTINGS).map((x) => x.state)).toEqual(["official", "official", "not_started", "not_started"]);
  });
  it("Q4 in progress: Final provisional; in OT with regulation setting it is already official", () => {
    const q4: ScoreSnapshot = { ...ot, status: "in_progress", periods: { home: [13, 0, 0, 12], away: [7, 7, 3, 8] }, total: { home: 25, away: 25 } };
    expect(periodResults(q4, DEFAULT_SETTINGS)[3]!.state).toBe("in_progress");
    expect(periodResults(q4, { finalIncludesOvertime: false })[3]!.state).toBe("in_progress");
    const inOt: ScoreSnapshot = { ...ot, status: "in_progress" };
    expect(periodResults(inOt, { finalIncludesOvertime: false })[3]).toMatchObject({ state: "official", score: { home: 25, away: 25 } });
    expect(periodResults(inOt, DEFAULT_SETTINGS)[3]!.state).toBe("in_progress");
  });
  it("scheduled game has nothing", () => {
    const pre: ScoreSnapshot = { ...ot, status: "scheduled", periods: { home: [], away: [] }, total: { home: 0, away: 0 } };
    expect(periodResults(pre, DEFAULT_SETTINGS).every((x) => x.state === "not_started")).toBe(true);
  });
});

describe("freshness", () => {
  const live: ScoreSnapshot = { ...ot, status: "in_progress" };
  const at = (s: number) => new Date(Date.parse(live.fetchedAt) + s * 1000);
  it("live only when recently fetched", () => {
    expect(freshness(live, at(10))).toBe("live");
    expect(freshness(live, at(61))).toBe("stale");
  });
  it("clock skew and manual entries are never live", () => {
    expect(freshness(live, at(-5))).toBe("stale");
    expect(freshness({ ...live, source: "manual" }, at(1))).toBe("stale");
  });
  it("final and pregame", () => {
    expect(freshness(ot, at(99999))).toBe("final");
    expect(freshness({ ...ot, status: "scheduled" }, at(1))).toBe("pregame");
  });
});

describe("orientation", () => {
  it("maps pool top/left onto home/away, in either order", () => {
    expect(orientation(ot, "Falcons", "Indianapolis Colts")).toEqual({ top: "away", left: "home" });
    const o = orientation(ot, "colts", "ATL")!;
    expect(toPoolScore({ home: 31, away: 25 }, o)).toEqual({ top: 31, left: 25 });
  });
  it("accepts the wording people write on sheets, whole words only", () => {
    expect(orientation(ot, "PHILA EAGLES", "x")).toBeNull();
    expect(orientation(ot, "FALCONS", "INDIANAPOLIS COLTS")).toEqual({ top: "away", left: "home" });
    expect(orientation(ot, "AFC - COLTS", "NFC - FALCONS")).toEqual({ top: "home", left: "away" });
    expect(orientation(ot, "Atlanta", "IND")).toEqual({ top: "away", left: "home" });
    expect(orientation(ot, "Falcon", "Colts")).toBeNull(); // not a whole word
  });
  it("shorthand and ambiguity", () => {
    const tb = { abbr: "TB", name: "Tampa Bay Buccaneers", nickname: "Buccaneers", location: "Tampa Bay" };
    const kc = { abbr: "KC", name: "Kansas City Chiefs", nickname: "Chiefs", location: "Kansas City" };
    const g = { ...ot, home: tb, away: kc };
    expect(orientation(g, "NFC - BUCS", "AFC - CHIEFS")).toEqual({ top: "home", left: "away" });
    const nyg = { abbr: "NYG", name: "New York Giants", nickname: "Giants", location: "New York" };
    const nyj = { abbr: "NYJ", name: "New York Jets", nickname: "Jets", location: "New York" };
    expect(orientation({ ...ot, home: nyg, away: nyj }, "New York", "New York")).toBeNull();
    expect(orientation({ ...ot, home: nyg, away: nyj }, "New York Giants", "New York Jets")).toEqual({ top: "home", left: "away" });
  });
  it("null when teams don't match", () => {
    expect(orientation(ot, "Eagles", "Commanders")).toBeNull();
    expect(orientation(ot, "Colts", "Colts")).toBeNull();
  });
});
