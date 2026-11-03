import { PERIODS, type Period } from "./periods.js";
import { winningCell } from "./engine.js";
import type { Pool } from "./schema.js";

export interface Payment {
  kind: "forward" | "reverse";
  row: number;
  col: number;
  /** null when the square was never sold. */
  owner: string | null;
  amount: number;
}

export interface PeriodSettlement {
  period: Period;
  /** The period's own slice of the pot. */
  base: number;
  /** Unsold winnings rolled in from earlier periods. */
  carriedIn: number;
  payments: Payment[];
  /** Unsold winnings rolled into the next period. */
  rolledForward: number;
  /** Unsold winnings kept by the house. */
  toHouse: number;
}

export interface Settlement {
  pot: number;
  /** Squares with an owner entry (an unreadable name still counts as sold). */
  soldSquares: number;
  periods: PeriodSettlement[];
  /** Unallocated percentage plus unsold winnings sent to the house (excludes pending rollover). */
  houseTotal: number;
  /** Rolled forward from the last settled period into a period that isn't official yet. */
  pendingRollover: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Who is owed what, using the pool's settings. Pass only OFFICIAL cumulative scores (top/left, in pool terms);
 * periods you leave out are not settled. Rollover only flows into a period that is settled later in Q1..Final order.
 */
export function settle(pool: Pool, official: Partial<Record<Period, { top: number; left: number }>>): Settlement {
  const { buyIn, payoutPercentages, reverseShare, unsoldWinner } = pool.settings;
  const soldSquares = Object.keys(pool.owners).length;
  const pot = cents(buyIn * soldSquares);
  const allocated = PERIODS.reduce((s, p) => s + (payoutPercentages[p] ?? 0), 0);
  let houseTotal = cents(pot - cents((pot * allocated) / 100));
  const periods: PeriodSettlement[] = [];
  let carry = 0;

  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i]!;
    const score = official[period];
    if (!score) continue;
    const base = cents((pot * (payoutPercentages[period] ?? 0)) / 100);
    const carriedIn = carry;
    carry = 0;
    const total = cents(base + carriedIn);

    const fwd = winningCell(pool, period, score.top, score.left);
    const rev = winningCell(pool, period, score.left, score.top);
    const sameCell = fwd.row === rev.row && fwd.col === rev.col;
    const revAmount = reverseShare > 0 && !sameCell ? cents((total * reverseShare) / 100) : 0;
    const raw: Array<[Payment["kind"], { row: number; col: number }, number]> = [["forward", fwd, cents(total - revAmount)]];
    if (revAmount > 0) raw.push(["reverse", rev, revAmount]);

    const payments: Payment[] = raw.map(([kind, c, amount]) => ({ kind, row: c.row, col: c.col, owner: pool.owners[`${c.row},${c.col}`] ?? null, amount }));
    const unsold = cents(payments.filter((p) => p.owner === null).reduce((s, p) => s + p.amount, 0));
    const rolls = unsoldWinner === "rollover" && period !== "Final";
    if (rolls) carry = unsold;
    else houseTotal = cents(houseTotal + unsold);
    periods.push({
      period,
      base,
      carriedIn,
      payments: payments.filter((p) => p.owner !== null),
      rolledForward: rolls ? unsold : 0,
      toHouse: rolls ? 0 : unsold,
    });
  }
  return { pot, soldSquares, periods, houseTotal, pendingRollover: carry };
}
