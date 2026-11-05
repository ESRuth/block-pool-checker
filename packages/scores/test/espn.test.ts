import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, freshness, periodResults } from "@bpc/engine";
import { EspnNfl, ManualScoreProvider, mapStatus } from "../src/index.js";

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));
const NOW = new Date("2026-11-02T18:00:00Z");

const routes: Record<string, unknown> = {
  "/summary?event=401772636": fx("summary_final_ot"),
  "/summary?event=401873026": fx("summary_final"),
  "/teams?limit=40": fx("teams"),
  "/teams/phi/schedule": fx("schedule_phi"),
  "/teams/wsh/schedule": fx("schedule_wsh"),
  "/scoreboard": fx("scoreboard_week8"),
};
const calls: string[] = [];
const espn = () =>
  new EspnNfl(
    async (url) => {
      const key = url.replace(/^.*\/nfl/, "");
      calls.push(key);
      if (!(key in routes)) throw new Error(`unexpected fetch ${key}`);
      return routes[key];
    },
    () => NOW,
  );

describe("getScore", () => {
  it("parses a final OT game from a recorded response", async () => {
    const s = await espn().getScore("401772636");
    expect(s).toMatchObject({ source: "espn", status: "final", fetchedAt: NOW.toISOString(), total: { home: 31, away: 25 } });
    expect(s.home.abbr).toBe("IND");
    expect(s.periods).toEqual({ home: [13, 0, 0, 12, 6], away: [7, 7, 3, 8, 0] });
    expect(periodResults(s, DEFAULT_SETTINGS)[3]!.score).toEqual({ home: 31, away: 25 });
    expect(periodResults(s, { finalIncludesOvertime: false })[3]!.score).toEqual({ home: 25, away: 25 });
    expect(freshness(s, NOW)).toBe("final");
  });
  it("parses a regulation final", async () => {
    const s = await espn().getScore("401873026");
    expect(s.total).toEqual({ home: 36, away: 10 });
    expect(s.periods.home).toEqual([10, 6, 7, 13]);
  });
  it("reads who has the ball from a live game, matched by team id, and ignores it otherwise", async () => {
    const base = fx("summary_final");
    const c = base.header.competitions[0];
    const [a, b] = c.competitors; // ids are added: the recorded copy is anonymous about them
    a.team.id = "21";
    b.team.id = "28";
    const live = (situation: unknown, name = "STATUS_IN_PROGRESS") => {
      const copy = structuredClone(base);
      copy.header.competitions[0].status.type.name = name;
      copy.situation = situation;
      return new EspnNfl(
        async () => copy,
        () => NOW,
      );
    };
    const home = c.competitors.find((x: { homeAway: string }) => x.homeAway === "home").team.id;
    const got = await live({ possession: home, downDistanceText: "1st & 10 at WSH 25" }).getScore("x");
    expect(got.situation).toEqual({ possession: "home", downDistance: "1st & 10 at WSH 25" });
    expect((await live({ possession: 999 }).getScore("x")).situation).toBeUndefined(); // unknown team id
    expect((await live({ possession: home }, "STATUS_FINAL").getScore("x")).situation).toBeUndefined(); // not in progress
    expect((await live("garbage").getScore("x")).situation).toBeUndefined(); // malformed block never breaks the score
  });
  it("maps statuses", () => {
    expect(mapStatus("STATUS_IN_PROGRESS")).toBe("in_progress");
    expect(mapStatus("STATUS_END_PERIOD")).toBe("in_progress");
    expect(mapStatus("STATUS_HALFTIME")).toBe("halftime");
    expect(mapStatus("STATUS_SCHEDULED")).toBe("scheduled");
    expect(mapStatus("STATUS_FINAL")).toBe("final");
  });
});

describe("game suggestions", () => {
  it("findTeams matches names, locations, abbreviations", async () => {
    const e = espn();
    expect((await e.findTeams("Philadelphia Eagles")).map((t) => t.abbr)).toEqual(["PHI"]);
    expect((await e.findTeams("commanders")).map((t) => t.abbr)).toEqual(["WSH"]);
    expect((await e.findTeams("eagles v. washington")).map((t) => t.abbr).sort()).toEqual(["PHI", "WSH"]);
    expect((await e.findTeams("new york")).map((t) => t.abbr).sort()).toEqual(["NYG", "NYJ"]);
    expect(await e.findTeams("zzz")).toEqual([]);
  });
  it("forTeams puts the head-to-head game first, most recent first, no far-future games", async () => {
    const games = await espn().forTeams("Eagles", "Commanders");
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) expect(Date.parse(g.kickoff)).toBeLessThan(NOW.getTime() + 36 * 3600_000);
    const abbrs = (g: (typeof games)[number]) => [g.home.abbr, g.away.abbr].sort().join();
    expect(abbrs(games[0]!)).toBe("PHI,WSH");
    expect(games[0]!.status).toBe("final");
  });
  it("accepts team-schedule events whose score is an object", async () => {
    const sched = structuredClone(routes["/teams/phi/schedule"]) as any;
    for (const c of sched.events[0].competitions[0].competitors) c.score = { value: 7, displayValue: "7" };
    const e = new EspnNfl(
      async (url) => (url.endsWith("/teams?limit=40") ? routes["/teams?limit=40"] : sched),
      () => NOW,
    );
    expect((await e.search("eagles")).length).toBeGreaterThan(0);
  });
  it("search with one team returns that team's games, newest first", async () => {
    const games = await espn().search("eagles");
    const times = games.map((g) => Date.parse(g.kickoff));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(games.every((g) => g.home.abbr === "PHI" || g.away.abbr === "PHI")).toBe(true);
  });
  it("recent() lists current-week games without walking back when it has enough", async () => {
    calls.length = 0;
    const games = await espn().recent(3);
    expect(games).toHaveLength(3);
    expect(calls).toEqual(["/scoreboard"]);
  });
});

describe("ManualScoreProvider", () => {
  it("stamps source and time, and is never live", async () => {
    const m = new ManualScoreProvider(() => NOW);
    const base = await espn().getScore("401873026");
    const { source: _s, fetchedAt: _f, ...entry } = { ...base, status: "in_progress" as const };
    m.set(entry);
    const got = await m.getScore("401873026");
    expect(got).toMatchObject({ source: "manual", fetchedAt: NOW.toISOString() });
    expect(freshness(got, NOW)).toBe("stale");
    await expect(m.getScore("nope")).rejects.toThrow();
  });
});
