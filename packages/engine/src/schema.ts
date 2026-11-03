import { z } from "zod";
import { PoolSettingsSchema } from "./settings.js";

import { PeriodSchema } from "./periods.js";
export { PERIODS, PeriodSchema, type Period } from "./periods.js";

/** A permutation of 0-9: each digit exactly once. */
export const DigitAxisSchema = z
  .array(z.number().int().min(0).max(9))
  .length(10)
  .refine((a) => new Set(a).size === 10, "each digit 0-9 must appear exactly once");

export const AxisPairSchema = z.object({ top: DigitAxisSchema, left: DigitAxisSchema });
export type AxisPair = z.infer<typeof AxisPairSchema>;

/** Either one shared pair for every payout, or an independent pair per period. */
export const DigitsSchema = z.union([
  z.object({ shared: AxisPairSchema }).strict(),
  z.object({ Q1: AxisPairSchema, Half: AxisPairSchema, Q3: AxisPairSchema, Final: AxisPairSchema }).strict(),
]);

const Point = z.tuple([z.number(), z.number()]);
const ScoreSchema = z.object({ top: z.number().int().nonnegative(), left: z.number().int().nonnegative() });
export type Score = z.infer<typeof ScoreSchema>;

export const PoolSchema = z
  .object({
    schema_version: z.literal(1),
    top_team: z.string().trim().min(1),
    left_team: z.string().trim().min(1),
    game_date: z.string().optional(),
    /** Provider game id (ESPN event id) used to fetch scores. */
    game_id: z.string().optional(),
    /** TL, TR, BR, BL of the 10x10 grid (no header bands), in original photo pixels. */
    grid_corners: z.tuple([Point, Point, Point, Point]).optional(),
    digits: DigitsSchema,
    /** Keys are "row,col", 1-based. */
    owners: z.record(z.string().regex(/^(10|[1-9]),(10|[1-9])$/, "row,col must be 1-10"), z.string()).default({}),
    cumulative_scores: z.record(PeriodSchema, ScoreSchema).optional(),
    notes: z.string().optional(),
    settings: PoolSettingsSchema.prefault({}),
  })
  .refine((p) => p.top_team.toLowerCase() !== p.left_team.toLowerCase(), "teams must differ");
export type Pool = z.infer<typeof PoolSchema>;

export const PayoutRulesSchema = z.union([
  z.object({
    kind: z.literal("shares"),
    pricePerSquare: z.number().nonnegative(),
    soldSquares: z.number().int().min(0).max(100),
    shares: z.record(PeriodSchema, z.number().nonnegative()),
  }),
  z.object({ kind: z.literal("fixed"), amounts: z.record(PeriodSchema, z.number().nonnegative()) }),
]);
export type PayoutRules = z.infer<typeof PayoutRulesSchema>;
