import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { GameDirectory, ScoreProvider } from "@bpc/scores";
import { createAccess } from "./access.js";
import type { Reader } from "./reader.js";
import type { SheetPhotoStore, SheetRepository } from "./sheets.js";
import type { UserRepository } from "./users.js";
import { adminRoutes } from "./routes/admin.js";
import { gameRoutes } from "./routes/games.js";
import { readingRoutes } from "./routes/reading.js";
import { sheetRoutes } from "./routes/sheets.js";

export { RETENTION_DAYS } from "./routes/sheets.js";

export interface Deps {
  scores: ScoreProvider;
  games: GameDirectory;
  sheets: SheetRepository;
  sheetPhotos: SheetPhotoStore;
  /** Personal invite keys. Omit and only the owner code works. */
  users?: UserRepository;
  /** Omit to disable /api/read and /api/read-names. */
  reader?: Reader;
  /** If set, the model routes and sheet creation require this (or a personal key) in the X-Invite-Code header: they spend money. */
  inviteCode?: string;
  /** Model reads (photo or names) one invited person may make per UTC day; the owner is exempt. Default 40; 0 turns the cap off. */
  dailyReadCap?: number;
  now?: () => Date;
}

/** The whole HTTP API. Each group of routes lives in `routes/`; who-is-asking and the read cap live in `access.ts`. */
export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const access = createAccess({ ...deps, now });
  const app = new Hono();

  const smallBody = bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: "body too large" }, 413) });
  app.use("/api/sheets", smallBody);
  app.use("/api/sheets/:id", smallBody);
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: "invalid request", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
    if (err instanceof SyntaxError) return c.json({ error: "invalid JSON" }, 400);
    console.error("unhandled", err instanceof Error ? err.message : "error"); // never log bodies: they hold names
    return c.json({ error: "internal error" }, 500);
  });

  adminRoutes(app, access);
  sheetRoutes(app, access, deps.sheets, deps.sheetPhotos);
  gameRoutes(app, deps.scores, deps.games, now);
  readingRoutes(app, access, deps.reader);
  app.get("/api/health", (c) => c.text("ok"));

  return app;
}
