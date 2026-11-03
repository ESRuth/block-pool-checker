import { z } from "zod";
import { PERIODS, type Period } from "./periods.js";
import { DigitAxisSchema, DigitsSchema } from "./schema.js";

/** A digit as read from a photo; null = the reader could not read it. Never guessed. */
const ReadDigit = z.number().int().min(0).max(9).nullable();
const ReadAxis = z.array(ReadDigit);
const SharedSets = z.object({ shared: ReadAxis });
const PeriodSets = z.object({ Q1: ReadAxis, Half: ReadAxis, Q3: ReadAxis, Final: ReadAxis });

const Corner = z.tuple([z.number(), z.number()]);

/** What a vision model returns for a pool photo (names are never requested). Corners are 0-1000 of image width/height. */
export const ReadResultSchema = z.object({
  top_team: z.string().nullable(),
  left_team: z.string().nullable(),
  digit_sets: z.enum(["shared", "per_period"]),
  top: z.union([SharedSets, PeriodSets]),
  left: z.union([SharedSets, PeriodSets]),
  grid_corners: z.tuple([Corner, Corner, Corner, Corner]),
  grid_complete: z.boolean(),
  uncertain: z.array(z.string()).default([]),
});
export type ReadResult = z.infer<typeof ReadResultSchema>;

export type DigitProblemKind = "missing_set" | "wrong_length" | "unreadable_digit" | "duplicate_digit";
export interface DigitProblem {
  set: "shared" | Period;
  axis: "top" | "left";
  kind: DigitProblemKind;
  /** What the reader returned, so a person can correct it. */
  got: Array<number | null> | null;
}

export interface DigitsOutcome {
  /** Only present when every row is a clean 0-9 permutation. Otherwise it is a hard stop: nothing is guessed. */
  digits: z.infer<typeof DigitsSchema> | null;
  problems: DigitProblem[];
}

function check(got: Array<number | null> | undefined, set: DigitProblem["set"], axis: DigitProblem["axis"], problems: DigitProblem[]) {
  if (!got) return void problems.push({ set, axis, kind: "missing_set", got: null });
  if (got.length !== 10) return void problems.push({ set, axis, kind: "wrong_length", got });
  if (got.some((d) => d === null)) return void problems.push({ set, axis, kind: "unreadable_digit", got });
  if (new Set(got).size !== 10) return void problems.push({ set, axis, kind: "duplicate_digit", got });
}

/** Turn a read into engine digits, or list exactly which rows are not valid permutations. */
export function readToDigits(read: ReadResult): DigitsOutcome {
  const problems: DigitProblem[] = [];
  const sets = (read.digit_sets === "shared" ? ["shared"] : [...PERIODS]) as Array<"shared" | Period>;
  const axisOf = (ax: "top" | "left", set: "shared" | Period) => (read[ax] as Record<string, Array<number | null>>)[set];
  for (const set of sets) for (const ax of ["top", "left"] as const) check(axisOf(ax, set), set, ax, problems);
  if (problems.length) return { digits: null, problems };

  const pair = (set: "shared" | Period) => ({
    top: DigitAxisSchema.parse(axisOf("top", set)),
    left: DigitAxisSchema.parse(axisOf("left", set)),
  });
  const digits = read.digit_sets === "shared" ? { shared: pair("shared") } : { Q1: pair("Q1"), Half: pair("Half"), Q3: pair("Q3"), Final: pair("Final") };
  return { digits: DigitsSchema.parse(digits), problems };
}
