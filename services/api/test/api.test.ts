import { describe, expect, it } from "vitest";
import type { ScoreSnapshot } from "@bpc/engine";
import type { GameDirectory, GameRef, ScoreProvider } from "@bpc/scores";
import { CachedScores, MemorySheetPhotos, MemorySheetRepository, createApp } from "../src/index.js";

const IND = { abbr: "IND", name: "Indianapolis Colts", nickname: "Colts", location: "Indianapolis" };
const ATL = { abbr: "ATL", name: "Atlanta Falcons", nickname: "Falcons", location: "Atlanta" };
const FINAL: ScoreSnapshot = {
  gameId: "g1",
  league: "nfl",
  source: "espn",
  fetchedAt: "2026-11-02T12:00:00.000Z",
  kickoff: "2025-11-09T14:30:00.000Z",
  status: "final",
  statusDetail: "Final/OT",
  home: IND,
  away: ATL,
  periods: { home: [13, 0, 0, 12, 6], away: [7, 7, 3, 8, 0] },
  total: { home: 31, away: 25 },
};

function setup(opts: { snap?: () => Promise<ScoreSnapshot>; now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date("2026-11-02T12:00:30.000Z"));
  const calls: string[] = [];
  const scores: ScoreProvider = { getScore: opts.snap ?? (async () => FINAL) };
  const g: GameRef = { gameId: "g1", kickoff: FINAL.kickoff!, status: "final", home: IND, away: ATL, label: "Week 10" };
  const games: GameDirectory = {
    recent: async () => {
      calls.push("recent");
      return [g];
    },
    forTeams: async (t, l) => {
      calls.push(`forTeams:${t}:${l}`);
      return [g];
    },
    search: async (q) => {
      calls.push(`search:${q}`);
      return [g];
    },
  };
  const app = createApp({ scores, games, sheets: new MemorySheetRepository(now), sheetPhotos: new MemorySheetPhotos(), now });
  return { app, calls };
}

describe("health", () => {
  it("answers ok at /api/health", async () => {
    const r = await setup().app.request("/api/health");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });
});

describe("games", () => {
  it("routes to the directory", async () => {
    const s = setup();
    expect(((await (await s.app.request("/api/games/recent")).json()) as any).games).toHaveLength(1);
    await s.app.request("/api/games/suggest?top=Eagles&left=Commanders");
    await s.app.request("/api/games/search?q=giants");
    expect(s.calls).toEqual(["recent", "forTeams:Eagles:Commanders", "search:giants"]);
    expect((await s.app.request("/api/games/suggest")).status).toBe(400);
    expect((await s.app.request("/api/games/search")).status).toBe(400);
  });
});

describe("game score", () => {
  it("returns snapshot, freshness and server time; 502 when the provider is down", async () => {
    const s = setup();
    const r: any = await (await s.app.request("/api/games/g1/score")).json();
    expect(r.snapshot.gameId).toBe("g1");
    expect(r.freshness).toBe("final");
    expect(r.serverTime).toBe("2026-11-02T12:00:30.000Z");
    const down = setup({
      snap: async () => {
        throw new Error("x");
      },
    });
    expect((await down.app.request("/api/games/g1/score")).status).toBe(502);
    expect((await s.app.request("/api/games/g1/score")).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("CachedScores", () => {
  const live = (n: number): ScoreSnapshot => ({ ...FINAL, status: "in_progress", fetchedAt: new Date(n).toISOString() });
  it("caches within the TTL and dedupes concurrent calls", async () => {
    let t = 1_000_000,
      calls = 0;
    const c = new CachedScores(
      {
        getScore: async () => {
          calls++;
          return live(t);
        },
      },
      20_000,
      () => t,
    );
    await Promise.all([c.getScore("g"), c.getScore("g"), c.getScore("g")]);
    expect(calls).toBe(1);
    t += 19_000;
    await c.getScore("g");
    expect(calls).toBe(1);
    t += 2_000;
    await c.getScore("g");
    expect(calls).toBe(2);
  });
  it("on upstream failure serves the old snapshot with its ORIGINAL fetchedAt", async () => {
    let t = 1_000_000,
      fail = false;
    const c = new CachedScores(
      {
        getScore: async () => {
          if (fail) throw new Error("down");
          return live(t);
        },
      },
      20_000,
      () => t,
    );
    const first = await c.getScore("g");
    fail = true;
    t += 30_000;
    const again = await c.getScore("g");
    expect(again.fetchedAt).toBe(first.fetchedAt);
    const unknown = new CachedScores({
      getScore: async () => {
        throw new Error("down");
      },
    });
    await expect(unknown.getScore("x")).rejects.toThrow();
  });
});
