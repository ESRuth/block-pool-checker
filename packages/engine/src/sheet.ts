import { z } from "zod";

const Point = z.tuple([z.number(), z.number()]).readonly();
const Team = z.object({ abbr: z.string(), name: z.string(), nickname: z.string(), location: z.string().optional() });

/** What the app saves for one sheet (the photo is stored separately). Keys of `names` and entries of `mine` are "row,col", 1-based. */
export const SheetDocSchema = z.object({
  schema_version: z.literal(1).default(1),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  corners: z.tuple([Point, Point, Point, Point]).readonly(),
  teams: z.object({ top: z.string().trim().min(1).max(60), left: z.string().trim().min(1).max(60) }),
  mode: z.enum(["shared", "per_period"]),
  /** Digit rows keyed "<set>.<axis>"; '?' marks a digit nobody could read (the app refuses to score until it is fixed). */
  rows: z.record(z.string().max(40), z.string().regex(/^[0-9?]{0,10}$/)),
  game: z.object({
    gameId: z.string().min(1).max(40),
    kickoff: z.string(),
    status: z.enum(["scheduled", "in_progress", "halftime", "final"]),
    home: Team,
    away: Team,
    label: z.string().max(80),
  }),
  finalIncludesOvertime: z.boolean(),
  names: z.record(z.string().regex(/^(10|[1-9]),(10|[1-9])$/), z.object({ text: z.string().max(80), confirmed: z.boolean() })).default({}),
  mine: z
    .array(z.string().regex(/^(10|[1-9]),(10|[1-9])$/))
    .max(100)
    .default([]),
  /** Where the grid corners were when the names were read: if the grid later moves, those names may belong to other squares. */
  namesCorners: z.tuple([Point, Point, Point, Point]).readonly().optional(),
});
export type SheetDoc = z.infer<typeof SheetDocSchema>;
