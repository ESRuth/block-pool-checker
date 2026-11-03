import { z } from "zod";
import { PERIODS, type Period } from "./periods.js";
import type { PoolSettings } from "./settings.js";

export const SCORE_STATUSES = ["scheduled", "in_progress", "halftime", "final"] as const;
export const ScoreStatusSchema = z.enum(SCORE_STATUSES);
export type ScoreStatus = z.infer<typeof ScoreStatusSchema>;

export const TeamRefSchema = z.object({
  abbr: z.string(),
  name: z.string(), // "Philadelphia Eagles"
  nickname: z.string(), // "Eagles"
  location: z.string(), // "Philadelphia"
});
export type TeamRef = z.infer<typeof TeamRefSchema>;

const Points = z.array(z.number().int().nonnegative());

/** A score as of `fetchedAt`. Never present one as live without checking `freshness`. */
export const ScoreSnapshotSchema = z.object({
  gameId: z.string(),
  league: z.literal("nfl"),
  source: z.enum(["espn", "manual"]),
  fetchedAt: z.iso.datetime(),
  kickoff: z.iso.datetime({ offset: true }).optional(),
  status: ScoreStatusSchema,
  /** Provider's text, e.g. "Final/OT" or "3rd Quarter 4:12". */
  statusDetail: z.string(),
  home: TeamRefSchema,
  away: TeamRefSchema,
  /** Points scored in each period as reported (not cumulative); index 4+ is overtime. */
  periods: z.object({ home: Points, away: Points }),
  total: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
});
export type ScoreSnapshot = z.infer<typeof ScoreSnapshotSchema>;

// --- freshness -------------------------------------------------------------

export type Freshness = "final" | "live" | "stale" | "pregame";

/** Live-game scores older than this are shown as "not live". */
export const DEFAULT_MAX_LIVE_AGE_MS = 60_000;

export function freshness(s: ScoreSnapshot, now: Date, maxAgeMs = DEFAULT_MAX_LIVE_AGE_MS): Freshness {
  if (s.status === "final") return "final";
  if (s.status === "scheduled") return "pregame";
  const age = now.getTime() - Date.parse(s.fetchedAt);
  // A fetchedAt in the future means a bad clock; don't trust it as live.
  return age >= 0 && age <= maxAgeMs && s.source !== "manual" ? "live" : "stale";
}

// --- team orientation ------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Shorthand people write on sheets, mapped to the word used in the official name. */
const SHORTHAND: Record<string, string> = { bucs: "buccaneers", pats: "patriots", niners: "49ers", phila: "philadelphia", philly: "philadelphia" };

const wordsOf = (s: string) =>
  norm(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => SHORTHAND[w] ?? w);
const hasSequence = (hay: string[], needle: string[]) => needle.length > 0 && hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));

/** How specifically sheet text names a team: 4 full name, 3 nickname, 2 abbreviation, 1 location only, 0 not at all. */
function teamScore(name: string, t: TeamRef): number {
  const text = wordsOf(name);
  if (text.length === 0) return 0;
  const has = (alias: string) => hasSequence(text, wordsOf(alias));
  return has(t.name) ? 4 : has(t.nickname) ? 3 : has(t.abbr) ? 2 : has(t.location) ? 1 : 0;
}

/**
 * Does text from a sheet ("EAGLES", "PHILA EAGLES", "AFC - CHIEFS", "KC") name this team?
 * Whole words only: the full name, nickname, abbreviation or location anywhere in the text.
 */
export function teamMatches(name: string, t: TeamRef): boolean {
  return teamScore(name, t) > 0;
}

export interface Oriented {
  top: number;
  left: number;
}

/** Which side of the snapshot is the pool's top (columns) and left (rows) team. null if teams don't match. */
export function orientation(s: ScoreSnapshot, topTeam: string, leftTeam: string): { top: "home" | "away"; left: "home" | "away" } | null {
  const fit = (x: string, y: string, tx: TeamRef, ty: TeamRef) => {
    const p = teamScore(x, tx),
      q = teamScore(y, ty);
    return p > 0 && q > 0 ? p + q : 0;
  };
  const a = fit(topTeam, leftTeam, s.home, s.away);
  const b = fit(topTeam, leftTeam, s.away, s.home);
  if (a === b) return null; // neither fits, or both fit equally well (e.g. "New York" / "New York"): don't guess
  return a > b ? { top: "home", left: "away" } : { top: "away", left: "home" };
}

// --- per-period results ----------------------------------------------------

export type PeriodState = "official" | "in_progress" | "not_started";
export interface PeriodResult {
  period: Period;
  state: PeriodState;
  /** Cumulative score for this period; for "in_progress" it is the provisional current score. */
  score?: { home: number; away: number };
}

const sum = (a: number[], n = a.length) => a.slice(0, n).reduce((x, y) => x + y, 0);

/** Quarters that have finished. A tie-broken OT game is final with 4 regulation quarters done. */
export function completedQuarters(s: ScoreSnapshot): number {
  switch (s.status) {
    case "final":
      return 4;
    case "halftime":
      return 2;
    case "scheduled":
      return 0;
    case "in_progress":
      return Math.min(4, Math.max(0, Math.max(s.periods.home.length, s.periods.away.length) - 1));
  }
}

/**
 * Official vs provisional state of each payout period. Only "official" scores may be treated as winners;
 * "in_progress" is a provisional "currently winning".
 */
export function periodResults(s: ScoreSnapshot, settings: Pick<PoolSettings, "finalIncludesOvertime">): PeriodResult[] {
  const done = completedQuarters(s);
  const cum = (n: number) => ({ home: sum(s.periods.home, n), away: sum(s.periods.away, n) });
  return PERIODS.map((period, i): PeriodResult => {
    const q = i + 1;
    if (period !== "Final") {
      if (done >= q) return { period, state: "official", score: cum(q) };
      return done === q - 1 && s.status === "in_progress" ? { period, state: "in_progress", score: cum(q) } : { period, state: "not_started" };
    }
    // Final
    if (!settings.finalIncludesOvertime) {
      if (done >= 4) return { period, state: "official", score: cum(4) };
      return done === 3 && s.status === "in_progress" ? { period, state: "in_progress", score: cum(4) } : { period, state: "not_started" };
    }
    if (s.status === "final") return { period, state: "official", score: { ...s.total } };
    return done >= 3 && s.status === "in_progress" ? { period, state: "in_progress", score: { ...s.total } } : { period, state: "not_started" };
  });
}

/** Re-express a home/away score in the pool's top/left terms. */
export function toPoolScore(score: { home: number; away: number }, o: { top: "home" | "away"; left: "home" | "away" }): Oriented {
  return { top: score[o.top], left: score[o.left] };
}
