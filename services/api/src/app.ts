import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { GameDirectory, ScoreProvider } from "@bpc/scores";
import { createHash, randomBytes } from "node:crypto";
import { createAccess } from "./access.js";
import { createPins } from "./pins.js";
import type { Reader } from "./reader.js";
import type { SheetPhotoStore, SheetRepository } from "./sheets.js";
import type { UserRepository } from "./users.js";
import { MemoryVenueRepository, type VenueRepository } from "./venues.js";
import { ownerRoutes } from "./routes/owner.js";
import { gameRoutes } from "./routes/games.js";
import { readingRoutes } from "./routes/reading.js";
import { sheetRoutes } from "./routes/sheets.js";
import { venueRoutes } from "./routes/venues.js";

export { RETENTION_DAYS } from "./routes/sheets.js";

/** Photos are shown from blob: and data: addresses (the browser holds them); styles are set inline by the page. Nothing loads from another site. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export interface Deps {
  scores: ScoreProvider;
  games: GameDirectory;
  sheets: SheetRepository;
  sheetPhotos: SheetPhotoStore;
  /** Venues (a place's QR code, PIN and runners). Omit for in-memory. */
  venues?: VenueRepository;
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
  // Every response, pages included: stay out of search results, don't hand a sheet's address to other sites in the Referer header, and
  // switch on the browser's standard protections (no framing, no content sniffing, HTTPS only, scripts and images from this address only).
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Strict-Transport-Security", "max-age=31536000");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    c.header("Content-Security-Policy", CSP);
  });
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

  const venues = deps.venues ?? new MemoryVenueRepository();
  // Passes are signed with a key derived from the owner code, so every Cloud Run instance agrees; without one (local dev) each process makes its own.
  const pins = createPins(
    createHash("sha256")
      .update(`passes:${deps.inviteCode ?? randomBytes(32).toString("hex")}`)
      .digest("hex"),
    now,
  );

  ownerRoutes(app, access);
  sheetRoutes(app, access, deps.sheets, deps.sheetPhotos, venues, pins);
  venueRoutes(app, access, venues, deps.sheets, deps.sheetPhotos, pins);
  gameRoutes(app, deps.scores, deps.games, now);
  readingRoutes(app, access, deps.reader);
  app.get("/api/health", (c) => c.text("ok"));

  return app;
}
