import type { ScoreSnapshot, TeamRef } from "@bpc/engine";
import type { GameDirectory, GameRef, ScoreProvider } from "@bpc/scores";

const eagles: TeamRef = { abbr: "PHI", name: "Philadelphia Eagles", nickname: "Eagles", location: "Philadelphia" };
const commanders: TeamRef = { abbr: "WSH", name: "Washington Commanders", nickname: "Commanders", location: "Washington" };

interface StubGame {
  id: string;
  label: string;
  /** Kickoff relative to now in hours, or a fixed date for the recorded game. */
  kickoff: string | { hoursFromNow: number };
  status: ScoreSnapshot["status"];
  detail: string;
  /** Points per period as reported (not cumulative); 5 entries means overtime. */
  home: number[];
  away: number[];
}

/**
 * Offline demo games between the sample sheet's teams, one per state the app has to handle, so the whole flow can be tried with no network
 * and no cost: pick one in "Which game?" (new sheet, or Edit > Change game). The first is the recorded game the sample sheet was made for.
 * In-progress games are stamped "fetched now" on every request, so they show as live.
 */
const GAMES: StubGame[] = [
  // Q1 10-3, Half 10-13, Q3 10-16, Final 10-27.
  { id: "stub-phi-wsh", label: "Week 9", kickoff: "2026-11-01T18:00:00.000Z", status: "final", detail: "Final", home: [3, 10, 3, 11], away: [10, 0, 0, 0] },
  {
    id: "stub-phi-wsh-live",
    label: "Demo: live, 3rd quarter",
    kickoff: { hoursFromNow: -2 },
    status: "in_progress",
    detail: "3rd Quarter 4:12",
    home: [3, 10, 0],
    away: [10, 0, 3],
  },
  { id: "stub-phi-wsh-half", label: "Demo: halftime", kickoff: { hoursFromNow: -1.5 }, status: "halftime", detail: "Halftime", home: [3, 10], away: [10, 0] },
  { id: "stub-phi-wsh-next", label: "Demo: not started", kickoff: { hoursFromNow: 26 }, status: "scheduled", detail: "Upcoming", home: [], away: [] },
  // Tied 20-20 after four quarters, home wins 23-20 in overtime.
  {
    id: "stub-phi-wsh-ot",
    label: "Demo: final in overtime",
    kickoff: "2026-10-25T18:00:00.000Z",
    status: "final",
    detail: "Final/OT",
    home: [7, 3, 7, 3, 3],
    away: [3, 10, 0, 7, 0],
  },
];

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
const kickoffOf = (g: StubGame, now: Date) =>
  typeof g.kickoff === "string" ? g.kickoff : new Date(now.getTime() + g.kickoff.hoursFromNow * 3_600_000).toISOString();
const ref = (g: StubGame): GameRef => ({ gameId: g.id, kickoff: kickoffOf(g, new Date()), status: g.status, home: commanders, away: eagles, label: g.label });
const snapshot = (g: StubGame): ScoreSnapshot => ({
  gameId: g.id,
  league: "nfl",
  source: "manual",
  fetchedAt: new Date().toISOString(),
  kickoff: kickoffOf(g, new Date()),
  status: g.status,
  statusDetail: g.detail,
  home: commanders,
  away: eagles,
  periods: { home: g.home, away: g.away },
  total: { home: sum(g.home), away: sum(g.away) },
});

/** Recorded and made-up games for offline development and the end-to-end tests (READER=stub). It never touches the network. */
export const stubGames: GameDirectory = {
  recent: async () => GAMES.map(ref),
  forTeams: async () => GAMES.map(ref),
  search: async () => GAMES.map(ref),
};
export const stubScores: ScoreProvider = {
  getScore: async (id) => {
    const g = GAMES.find((x) => x.id === id);
    if (!g) throw new Error("unknown stub game");
    return snapshot(g);
  },
};
