import { PERIODS, PoolSchema, type AxisPair, type PayoutRules, type Period, type Pool } from "./schema.js";

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
export function winningCell(pool: Pool, period: Period, top: number, left: number): Winner {
  checkScore(top);
  checkScore(left);
  const axis = axisFor(pool, period);
  const topEnding = top % 10;
  const leftEnding = left % 10;
  const col = axis.top.indexOf(topEnding) + 1;
  const row = axis.left.indexOf(leftEnding) + 1;
  return { period, top, left, topEnding, leftEnding, row, col, owner: pool.owners[`${row},${col}`] ?? UNVERIFIED };
}

export interface PlayerSquare {
  row: number;
  col: number;
  owner: string;
  endings: Record<Period, { top: number; left: number }>;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Exact (case/whitespace-insensitive) name match only; similar names are never merged. */
export function playerSquares(pool: Pool, names: string[]): PlayerSquare[] {
  const wanted = new Set(names.map(norm));
  const out: PlayerSquare[] = [];
  for (const [key, owner] of Object.entries(pool.owners)) {
    if (!wanted.has(norm(owner))) continue;
    const [row, col] = key.split(",").map(Number) as [number, number];
    const endings = {} as PlayerSquare["endings"];
    for (const p of PERIODS) {
      const a = axisFor(pool, p);
      endings[p] = { top: a.top[col - 1]!, left: a.left[row - 1]! };
    }
    out.push({ row, col, owner, endings });
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

export interface PayoutResult {
  pot: number | null;
  amounts: Record<Period, number>;
  roundingDifference: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function payouts(rules: PayoutRules): PayoutResult {
  if (rules.kind === "fixed") {
    requireAll(rules.amounts);
    return { pot: null, amounts: { ...rules.amounts } as Record<Period, number>, roundingDifference: null };
  }
  requireAll(rules.shares);
  const total = PERIODS.reduce((s, p) => s + rules.shares[p]!, 0);
  if (Math.abs(total - 100) > 1e-7) throw new RangeError("shares must total 100");
  const pot = cents(rules.pricePerSquare * rules.soldSquares);
  const amounts = Object.fromEntries(PERIODS.map((p) => [p, cents((pot * rules.shares[p]!) / 100)])) as Record<Period, number>;
  const paid = PERIODS.reduce((s, p) => s + amounts[p], 0);
  return { pot, amounts, roundingDifference: cents(pot - paid) };
}

function requireAll(rec: Partial<Record<Period, number>>): void {
  for (const p of PERIODS) if (typeof rec[p] !== "number") throw new RangeError(`missing payout for ${p}`);
}

export interface NameMatch {
  /** Spelling as first seen on the board. */
  name: string;
  squares: number;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Names on the board matching typed text, for "is this me?" suggestions. Every typed word must start a word in the
 * name (best), or appear anywhere in it. Distinct names are never merged; the caller lets the user pick which are theirs.
 * Unreadable ("Unverified") squares are not suggested.
 */
export function findNames(pool: Pool, query: string, limit = 8): NameMatch[] {
  const q = words(query);
  if (q.length === 0) return [];
  const byKey = new Map<string, NameMatch>();
  for (const owner of Object.values(pool.owners)) {
    if (norm(owner) === norm(UNVERIFIED)) continue;
    const k = norm(owner);
    const cur = byKey.get(k);
    if (cur) cur.squares++;
    else byKey.set(k, { name: owner.trim(), squares: 1 });
  }
  const scored: Array<[number, NameMatch]> = [];
  for (const m of byKey.values()) {
    const w = words(m.name);
    const flat = w.join(" ");
    const score = q.every((t) => w.some((x) => x.startsWith(t))) ? 2 : q.every((t) => flat.includes(t)) ? 1 : 0;
    if (score) scored.push([score, m]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || b[1].squares - a[1].squares || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, m]) => m);
}
