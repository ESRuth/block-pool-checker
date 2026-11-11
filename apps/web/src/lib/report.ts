import type { Period } from "@bpc/engine";
import { PERIOD_COLOR, PERIOD_LABEL } from "./boxes";
import type { PeriodRow } from "./winners";

export interface ReportLine {
  period: Period;
  /** The sheet's own label for the period: 1, 2, 3, F. */
  label: string;
  /** Cumulative score as top-left, e.g. "10-3"; empty before the period starts. */
  score: string;
  /** True when a name belongs after the text (the block is inside the photo and the period has a winner). */
  wantsName: boolean;
  /** Key of the winning block ("row,col") that the name is cached under; row and column are never shown. */
  block: string | null;
  /** Short note after the name: "winning now, can change", "not started yet", "outside the photo". Empty when there is nothing to say. */
  note: string;
  color: string;
  dim: boolean;
}

/** The labels printed on the sheet's digit rows. */
const LABEL = PERIOD_LABEL;

/** "EAGLES" -> "Eagles", "PHILA EAGLES" -> "Phila Eagles"; mixed-case text is left as written. */
export function pretty(team: string): string {
  const t = team.trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : t;
}

/** "Team A vs Team B". */
export const matchup = (topTeam: string, leftTeam: string) => `${pretty(topTeam)} vs ${pretty(leftTeam)}`;

/** "Sunday, Nov 1, 2026" in the viewer's time zone. */
export const gameDate = (kickoffIso: string) =>
  new Date(kickoffIso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

/** "Sunday, Nov 22": the day of a game without the year, for lists of this week's sheets. */
export const gameDay = (kickoffIso: string) => new Date(kickoffIso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

/** "Sunday, Nov 22 · 1:00 PM": the day and kickoff time of a game, in the viewer's own time zone. */
export const gameWhen = (kickoffIso: string) =>
  `${gameDay(kickoffIso)} · ${new Date(kickoffIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, "\u00a0")}`; // no break inside the time

/** What a sheet is called: the teams, from its game, and the runner's tag if there is one ("Eagles vs Steelers · $5"). */
export const sheetName = (top: string, left: string, tag?: string) => `${matchup(top, left)}${tag ? ` · ${tag}` : ""}`;

export function reportTitle(topTeam: string, leftTeam: string, kickoffIso: string): string {
  const d = new Date(kickoffIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${pretty(topTeam)} vs ${pretty(leftTeam)}, ${d}`;
}

/** One line per period: label, score, the winning block's name, and a short note. */
export function reportLines(rows: PeriodRow[], outside: Set<string>): ReportLine[] {
  return rows.map((r): ReportLine => {
    const label = LABEL[r.period];
    if (!r.block || !r.score)
      return { period: r.period, label, score: "", wantsName: false, block: null, note: "not started yet", color: "#777777", dim: true };
    const key = `${r.block.row},${r.block.col}`;
    const isOutside = outside.has(key);
    const note = isOutside ? "block is outside the photo" : r.state === "in_progress" ? "winning now, can change" : "";
    return {
      period: r.period,
      label,
      score: `${r.score.top}-${r.score.left}`,
      wantsName: !isOutside,
      block: isOutside ? null : key,
      note,
      color: PERIOD_COLOR[r.period],
      dim: false,
    };
  });
}

/**
 * The teams for a new game, keeping the side the paper sheet has them on: if the team that was across the top plays in the new game it stays
 * on top, otherwise the away team goes across the top. (Names written on a sheet are free text, so a team matches on its nickname.)
 */
export function teamsForGame(
  prev: { top: string; left: string },
  game: { away: { nickname: string }; home: { nickname: string } },
): { top: string; left: string } {
  const was = prev.top.trim().toLowerCase();
  const mine = (nick: string) => was !== "" && (was.includes(nick.toLowerCase()) || nick.toLowerCase().includes(was));
  if (mine(game.home.nickname) && !mine(game.away.nickname)) return { top: game.home.nickname, left: game.away.nickname };
  return { top: game.away.nickname, left: game.home.nickname };
}
