import type { Hono } from "hono";
import { freshness } from "@bpc/engine";
import type { GameDirectory, ScoreProvider } from "@bpc/scores";

const limit = (v: string | undefined, d: number) => Math.min(Math.max(Number(v) || d, 1), 20);
const upstream = async <T>(c: { json: (b: unknown, s: 502) => Response }, f: () => Promise<T>): Promise<T | Response> => {
  try {
    return await f();
  } catch {
    return c.json({ error: "game list unavailable" }, 502);
  }
};

/** Game lists and live scores. Open to everyone: they hold no sheet data. */
export function gameRoutes(app: Hono, scores: ScoreProvider, games: GameDirectory, now: () => Date) {
  /** Score for any game by id, no sheet needed. Same freshness rules: the snapshot keeps its own fetchedAt. */
  app.get("/api/games/:gameId/score", async (c) => {
    try {
      const snapshot = await scores.getScore(c.req.param("gameId"));
      return c.json({ snapshot, freshness: freshness(snapshot, now()), serverTime: now().toISOString() });
    } catch {
      return c.json({ error: "scores unavailable" }, 502);
    }
  });

  app.get("/api/games/recent", async (c) => {
    const r = await upstream(c, () => games.recent(limit(c.req.query("limit"), 8)));
    return r instanceof Response ? r : c.json({ games: r });
  });

  /** Known teams -> their games (head-to-head first); otherwise callers should use /recent or /search. */
  app.get("/api/games/suggest", async (c) => {
    const top = c.req.query("top")?.trim();
    const left = c.req.query("left")?.trim();
    if (!top) return c.json({ error: "top team required" }, 400);
    const r = await upstream(c, () => games.forTeams(top, left || undefined, limit(c.req.query("limit"), 5)));
    return r instanceof Response ? r : c.json({ games: r });
  });

  app.get("/api/games/search", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) return c.json({ error: "q required" }, 400);
    const r = await upstream(c, () => games.search(q, limit(c.req.query("limit"), 8)));
    return r instanceof Response ? r : c.json({ games: r });
  });
}
