import type { Period } from "@bpc/engine";
import { PERIOD_COLOR, PERIOD_LABEL } from "./boxes";
import type { PeriodRow } from "./winners";

export interface ReportLine {
  period: Period;
  /** The sheet's own label for the period: 1, 2, 3, F. */
  label: string;
  /** Cumulative score as top-left, e.g. "10-3"; empty before the period starts. */
  score: string;
  /** True when a name belongs after the text (the square is inside the photo and the period has a winner). */
  wantsName: boolean;
  /** Key of the winning square ("row,col") that the name is cached under; row and column are never shown. */
  cell: string | null;
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

/** "Eagles vs Commanders". */
export const matchup = (topTeam: string, leftTeam: string) => `${pretty(topTeam)} vs ${pretty(leftTeam)}`;

/** "Sunday, Nov 1, 2026" in the viewer's time zone. */
export const gameDate = (kickoffIso: string) =>
  new Date(kickoffIso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });

export function reportTitle(topTeam: string, leftTeam: string, kickoffIso: string): string {
  const d = new Date(kickoffIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${pretty(topTeam)} vs ${pretty(leftTeam)}, ${d}`;
}

/** One line per period: label, score, the winning square's name, and a short note. */
export function reportLines(rows: PeriodRow[], outside: Set<string>): ReportLine[] {
  return rows.map((r): ReportLine => {
    const label = LABEL[r.period];
    if (!r.cell || !r.score) return { period: r.period, label, score: "", wantsName: false, cell: null, note: "not started yet", color: "#777777", dim: true };
    const key = `${r.cell.row},${r.cell.col}`;
    const isOutside = outside.has(key);
    const note = isOutside ? "square is outside the photo" : r.state === "in_progress" ? "winning now, can change" : "";
    return {
      period: r.period,
      label,
      score: `${r.score.top}-${r.score.left}`,
      wantsName: !isOutside,
      cell: isOutside ? null : key,
      note,
      color: PERIOD_COLOR[r.period],
      dim: false,
    };
  });
}
