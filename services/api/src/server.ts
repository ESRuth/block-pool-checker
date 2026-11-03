import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { EspnNfl } from "@bpc/scores";
import { createApp } from "./app.js";
import { FirestoreUserRepository } from "./users.js";
import { FirestoreSheetRepository, GcsSheetPhotos, MemorySheetPhotos, MemorySheetRepository } from "./sheets.js";
import { GeminiReader, StubReader } from "./reader.js";
import { CachedScores } from "./score-cache.js";
import { stubGames, stubScores } from "./stub.js";

// With GCP_PROJECT unset the server runs fully in memory (local dev): sheets vanish on restart.
const useGcp = !!process.env.GCP_PROJECT;
// Without INVITE_CODE the API treats every caller as the owner (handy for local dev). Never let that happen against real data.
if (useGcp && !process.env.INVITE_CODE) throw new Error("INVITE_CODE is required when GCP_PROJECT is set");
const stub = process.env.READER === "stub";
if (stub && useGcp) throw new Error("READER=stub is for local development and cannot run with GCP_PROJECT");
const espn = new EspnNfl();

const app = createApp({
  // READER=stub is an offline mode: recorded reader answers, and one recorded game with its score (no model, no ESPN, no cost).
  scores: stub ? stubScores : new CachedScores(espn),
  games: stub ? stubGames : espn,
  // Photo reading needs a GCP project for Vertex AI; it is off in pure in-memory dev unless GOOGLE_CLOUD_PROJECT is set.
  // READER=stub answers from a recording (no model calls, no cost) for local development and UI tests.
  reader: stub
    ? new StubReader(JSON.parse(readFileSync(new URL("../test/fixtures/stub_eagles_commanders.json", import.meta.url), "utf8")))
    : process.env.GOOGLE_CLOUD_PROJECT
      ? new GeminiReader(process.env.GOOGLE_CLOUD_PROJECT, process.env.READER_MODEL, undefined, process.env.READER_THINKING)
      : undefined,
  inviteCode: process.env.INVITE_CODE,
  dailyReadCap: process.env.READ_CAP_PER_DAY ? Number(process.env.READ_CAP_PER_DAY) : undefined,
  users: useGcp ? new FirestoreUserRepository() : undefined,
  sheets: useGcp ? new FirestoreSheetRepository() : new MemorySheetRepository(),
  sheetPhotos: useGcp ? new GcsSheetPhotos(process.env.PHOTO_BUCKET!) : new MemorySheetPhotos(),
});

// In the container the built web app is served from the same address as the API (WEB_DIR). Unknown paths get index.html so /s/<id> links open.
const webDir = process.env.WEB_DIR;
if (webDir) {
  const index = readFileSync(`${webDir}/index.html`, "utf8");
  // A phone that installs the app from a personal link gets its key baked into the home-screen icon: the manifest's start_url carries it
  // in the #fragment (never sent to a server). Installing from the plain address gets the plain manifest.
  const manifest = JSON.parse(readFileSync(`${webDir}/manifest.webmanifest`, "utf8")) as Record<string, unknown>;
  app.get("/manifest.webmanifest", (c) => {
    const key = c.req.query("c") ?? "";
    const body = /^[A-Za-z0-9_-]{8,64}$/.test(key) ? { ...manifest, id: "/", start_url: `/#c=${key}` } : manifest;
    return c.body(JSON.stringify(body), 200, { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" });
  });
  app.use(
    "/*",
    serveStatic({
      root: webDir,
      onFound: (path, c) => {
        if (/sw\.js$|index\.html$|manifest/.test(path)) c.header("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.html(index, 200, { "Cache-Control": "no-cache" })));
}

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port }, () => console.log(`api on :${port} (${useGcp ? "gcp" : "in-memory"})`));
