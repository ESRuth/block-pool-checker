import { z } from "zod";
import { PeriodSchema } from "./periods.js";

const Percent = z.number().min(0).max(100);

/** Per-pool rules. Every field has a default so older pools keep parsing. */
export const PoolSettingsSchema = z.object({
  /** Price of one square. */
  buyIn: z.number().nonnegative().default(0),
  /** Percent of the pot paid per period; the remainder (if any) is the house/charity cut. */
  payoutPercentages: z
    .record(PeriodSchema, Percent)
    .default({ Q1: 15, Half: 30, Q3: 15, Final: 40 })
    .refine((p) => Object.values(p).reduce((a, b) => a + b, 0) <= 100, "payout percentages exceed 100"),
  /** true: "Final" is the score when the game ends, overtime included. false: Final is the end of the 4th quarter. */
  finalIncludesOvertime: z.boolean().default(true),
  /** Percent of each period's payout that goes to the reverse square (top/left endings swapped). 0 = no reverse winner. */
  reverseShare: Percent.default(0),
  /** What happens when a winning square was never sold: the house keeps it, or it adds to the next period's payout (Final: house). */
  unsoldWinner: z.enum(["house", "rollover"]).default("house"),
  /** Who gets the unallocated cut and any unsold winnings, e.g. "Charity". */
  houseName: z.string().trim().min(1).default("House"),
});
export type PoolSettings = z.infer<typeof PoolSettingsSchema>;

export const DEFAULT_SETTINGS: PoolSettings = PoolSettingsSchema.parse({});
