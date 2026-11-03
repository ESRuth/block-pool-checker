import { z } from "zod";

export const PERIODS = ["Q1", "Half", "Q3", "Final"] as const;
export const PeriodSchema = z.enum(PERIODS);
export type Period = z.infer<typeof PeriodSchema>;
