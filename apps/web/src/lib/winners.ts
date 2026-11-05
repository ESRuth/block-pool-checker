import { PERIODS, orientation, parsePool, periodResults, toPoolScore, winningCell, type Period, type ScoreSnapshot } from "@bpc/engine";
import type { DigitsOutcome } from "@bpc/engine";

export interface PeriodRow {
  period: Period;
  state: "official" | "in_progress" | "not_started";
  /** Cumulative score in the sheet's terms (top team / left team). */
  score?: { top: number; left: number };
  /** Score endings that win this period. */
  ending?: { top: number; left: number };
  /** Winning square, 1-based. Official = final winner; in_progress = "currently winning" (provisional). */
  cell?: { row: number; col: number };
}

export type WinnersOutcome =
  | {
      ok: true;
      rows: PeriodRow[];
      orientation: { top: "home" | "away"; left: "home" | "away" };
      /** Which sheet team has the ball, when the score source says (in-progress games only). */
      ball?: "top" | "left";
      /** e.g. "2nd & 7 at PHI 34". */
      downDistance?: string;
    }
  | { ok: false; reason: string };

/** Per-period box score and winning square for a game, given the sheet's teams and digits. Pure; nothing is guessed. */
export function computeWinners(
  snapshot: ScoreSnapshot,
  topTeam: string,
  leftTeam: string,
  digits: NonNullable<DigitsOutcome["digits"]>,
  finalIncludesOvertime: boolean,
): WinnersOutcome {
  const o = orientation(snapshot, topTeam, leftTeam);
  if (!o)
    return { ok: false, reason: `The teams on your sheet (${topTeam} / ${leftTeam}) don't match this game (${snapshot.away.name} at ${snapshot.home.name}).` };
  const pool = parsePool({ schema_version: 1, top_team: topTeam, left_team: leftTeam, digits });
  const results = periodResults(snapshot, { finalIncludesOvertime });
  const rows = PERIODS.map((period): PeriodRow => {
    const r = results.find((x) => x.period === period)!;
    if (!r.score) return { period, state: r.state };
    const score = toPoolScore(r.score, o);
    const w = winningCell(pool, period, score.top, score.left);
    return { period, state: r.state, score, ending: { top: w.topEnding, left: w.leftEnding }, cell: { row: w.row, col: w.col } };
  });
  const poss = snapshot.status === "in_progress" ? snapshot.situation?.possession : undefined;
  const ball = poss ? (o.top === poss ? "top" : "left") : undefined;
  return { ok: true, rows, orientation: o, ball, downDistance: ball ? snapshot.situation?.downDistance : undefined };
}
