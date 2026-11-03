import { describe, expect, it } from "vitest";
import type { ScoreSnapshot } from "@bpc/engine";
import { badge } from "../src/lib/fresh.js";

const T = { abbr: "A", name: "A A", nickname: "A", location: "A" };
const snap = (status: ScoreSnapshot["status"], source: "espn" | "manual" = "espn"): ScoreSnapshot => ({
  gameId: "g",
  league: "nfl",
  source,
  fetchedAt: "2026-11-02T20:00:00.000Z",
  status,
  statusDetail: "",
  home: T,
  away: { ...T, abbr: "B" },
  periods: { home: [], away: [] },
  total: { home: 0, away: 0 },
});
const at = (s: number) => Date.parse("2026-11-02T20:00:00.000Z") + s * 1000;

describe("badge", () => {
  it("live only when fresh and online", () => {
    expect(badge(snap("in_progress"), at(12), false)).toEqual({ tone: "live", text: "Live · updated 12s ago" });
  });
  it("old score is not live", () => {
    expect(badge(snap("in_progress"), at(300), false).tone).toBe("stale");
    expect(badge(snap("in_progress"), at(300), false).text).toMatch(/^Updated .*, not live$/);
  });
  it("offline never shows live, even if the snapshot is recent", () => {
    const b = badge(snap("in_progress"), at(5), true);
    expect(b.tone).toBe("stale");
    expect(b.text).toMatch(/^Offline · Updated .*, not live$/);
  });
  it("manual entries are never live", () => {
    expect(badge(snap("in_progress", "manual"), at(1), false).tone).toBe("stale");
  });
  it("final stays final offline, noting it was saved", () => {
    expect(badge(snap("final"), at(9999), false).text).toBe("Final");
    expect(badge(snap("final"), at(9999), true).text).toMatch(/^Final · saved /);
  });
  it("pregame", () => {
    expect(badge(snap("scheduled"), at(1), false).tone).toBe("pregame");
  });
});
