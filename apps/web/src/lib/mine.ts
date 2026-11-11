import type { DigitsOutcome, Period } from "@bpc/engine";
import type { PeriodRow } from "./winners";

type Digits = NonNullable<DigitsOutcome["digits"]>;
export type Side = "top" | "left";

/** Plays that change the score, as people say them. */
export const PLAYS = [
  { label: "a field goal", pts: 3 },
  { label: "a touchdown and extra point", pts: 7 },
  { label: "a touchdown with no extra point", pts: 6 },
  { label: "a touchdown and two-point conversion", pts: 8 },
  { label: "a safety", pts: 2 },
] as const;

export const PERIOD_NAME: Record<Period, string> = { Q1: "the 1st quarter", Half: "halftime", Q3: "the 3rd quarter", Final: "the final" };

const axisFor = (digits: Digits, period: Period) => ("shared" in digits ? digits.shared : digits[period]);

/** The block ("row,col") that wins a period at this cumulative score. */
export function blockAt(digits: Digits, period: Period, top: number, left: number): string {
  const a = axisFor(digits, period);
  return `${a.left.indexOf(left % 10) + 1},${a.top.indexOf(top % 10) + 1}`;
}

/** Score endings a block needs to win a period: top team's last digit and left team's last digit. */
export function endingsFor(digits: Digits, period: Period, block: string): { top: number; left: number } {
  const [row, col] = block.split(",").map(Number) as [number, number];
  const a = axisFor(digits, period);
  return { top: a.top[col - 1]!, left: a.left[row - 1]! };
}

export interface Win {
  period: Period;
  score: { top: number; left: number };
  block: string;
  official: boolean;
}

/** Periods whose winning block is one of yours: official wins, plus the period being played if you lead it right now. */
export function myWins(rows: PeriodRow[], mine: Set<string>): Win[] {
  return rows.flatMap((r) => {
    if (!r.block || !r.score || r.state === "not_started") return [];
    const block = `${r.block.row},${r.block.col}`;
    return mine.has(block) ? [{ period: r.period, score: r.score, block, official: r.state === "official" }] : [];
  });
}

export interface Scenario {
  team: Side;
  play: string;
  /** The score after this one play. */
  score: { top: number; left: number };
  /** The block that would lead the period after it. */
  block: string;
  /** Common plays are shown up front; the rest sit behind "other scores". */
  common: boolean;
}
export interface Outlook {
  period: Period;
  /** Current score for the period being played. */
  now: { top: number; left: number };
  /** The block leading now: it wins if nothing else is scored. */
  leader: string;
  /** Which team has the ball, when the score source says. Teams with the ball come first. */
  ball?: Side;
  /** What one scoring play by either team would do. The team with the ball first, then the other. */
  scenarios: Scenario[];
}

const COMMON_PLAYS = new Set([3, 7]);

/** For the period being played: who leads now and who would lead after each single scoring play. Real current score only. */
export function outlook(rows: PeriodRow[], digits: Digits, ball?: Side): Outlook | null {
  const cur = rows.find((r) => r.state === "in_progress" && r.score);
  if (!cur?.score) return null;
  const order: Side[] = ball === "left" ? ["left", "top"] : ["top", "left"];
  const scenarios: Scenario[] = order.flatMap((team) =>
    PLAYS.map((p) => {
      const score = { ...cur.score!, [team]: cur.score![team] + p.pts };
      return { team, play: p.label, score, block: blockAt(digits, cur.period, score.top, score.left), common: COMMON_PLAYS.has(p.pts) };
    }),
  );
  return { period: cur.period, now: cur.score, leader: blockAt(digits, cur.period, cur.score.top, cur.score.left), ball, scenarios };
}
