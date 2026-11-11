import { PoolSchema, type AxisPair, type Period, type Pool } from "./schema.js";

export function parsePool(input: unknown): Pool {
  return PoolSchema.parse(input);
}

export function axisFor(pool: Pool, period: Period): AxisPair {
  return "shared" in pool.digits ? pool.digits.shared : pool.digits[period];
}

export interface Winner {
  period: Period;
  top: number;
  left: number;
  topEnding: number;
  leftEnding: number;
  row: number;
  col: number;
  owner: string;
}

const UNVERIFIED = "Unverified";

function checkScore(n: number): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("scores must be nonnegative integers");
}

/** Score X (top) - Y (left): column = index of X%10 in top digits, row = index of Y%10 in left digits. */
export function winningBlock(pool: Pool, period: Period, top: number, left: number): Winner {
  checkScore(top);
  checkScore(left);
  const axis = axisFor(pool, period);
  const topEnding = top % 10;
  const leftEnding = left % 10;
  const col = axis.top.indexOf(topEnding) + 1;
  const row = axis.left.indexOf(leftEnding) + 1;
  return { period, top, left, topEnding, leftEnding, row, col, owner: pool.owners[`${row},${col}`] ?? UNVERIFIED };
}
