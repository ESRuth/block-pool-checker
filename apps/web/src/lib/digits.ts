import { PERIODS, type Period, type ReadResult } from "@bpc/engine";

export type SetKey = "shared" | Period;
export type Axis = "top" | "left";
/** One editable row of 10 digits, keyed "<set>.<axis>"; '?' marks a digit the reader could not read. */
export type RowText = Record<string, string>;

export const rowKey = (set: SetKey, axis: Axis) => `${set}.${axis}`;
export const setsFor = (mode: ReadResult["digit_sets"]): SetKey[] => (mode === "shared" ? ["shared"] : [...PERIODS]);

/** null when the row is a clean 0-9 permutation; otherwise why it is not. Nothing is ever guessed. */
export function rowProblem(text: string): string | null {
  if (text.length !== 10) return `needs 10 digits (has ${text.length})`;
  if (text.includes("?")) return "a digit could not be read";
  if (!/^[0-9]{10}$/.test(text)) return "digits only";
  if (new Set(text).size !== 10) return "a digit is repeated";
  return null;
}

export function rowsFromRead(read: ReadResult): RowText {
  const out: RowText = {};
  for (const set of setsFor(read.digit_sets)) {
    for (const axis of ["top", "left"] as const) {
      const got = (read[axis] as Record<string, Array<number | null> | undefined>)[set];
      out[rowKey(set, axis)] = got ? got.map((d) => (d === null ? "?" : String(d))).join("") : "";
    }
  }
  return out;
}

/** Keep only characters a row may hold, so a person can retype it quickly. */
export const cleanRow = (s: string) => s.replace(/[^0-9?]/g, "").slice(0, 10);

export function badRows(rows: RowText): Array<{ key: string; problem: string }> {
  return Object.entries(rows).flatMap(([key, text]) => {
    const problem = rowProblem(text);
    return problem ? [{ key, problem }] : [];
  });
}

export const asDigits = (text: string) => [...text].map(Number);

import { DigitsSchema } from "@bpc/engine";

/** Validated engine digits from the edited rows, or null if any row is not a clean permutation. */
export function rowsToDigits(rows: RowText, mode: ReadResult["digit_sets"]) {
  const get = (set: SetKey, axis: Axis) => asDigits(rows[rowKey(set, axis)] ?? "");
  const pair = (set: SetKey) => ({ top: get(set, "top"), left: get(set, "left") });
  const candidate = mode === "shared" ? { shared: pair("shared") } : { Q1: pair("Q1"), Half: pair("Half"), Q3: pair("Q3"), Final: pair("Final") };
  const r = DigitsSchema.safeParse(candidate);
  return r.success ? r.data : null;
}
