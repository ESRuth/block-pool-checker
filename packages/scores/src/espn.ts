import { z } from "zod";
import { ScoreSnapshotSchema, type ScoreSnapshot, type ScoreStatus, type TeamRef } from "@bpc/engine";
import type { GameDirectory, GameRef, ScoreProvider } from "./types.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

export type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
};

// --- loose response schemas (only what we read) ------------------------------

const EspnTeam = z.object({
  id: z.string().optional(),
  abbreviation: z.string(),
  displayName: z.string(),
  location: z.string().optional(),
  name: z.string().optional(),
  shortDisplayName: z.string().optional(),
});
const EspnStatus = z.object({ type: z.object({ name: z.string(), state: z.string().optional(), detail: z.string().optional() }) });
const EspnCompetitor = z.object({
  homeAway: z.enum(["home", "away"]),
  /** A string in scoreboard/summary, an object in team schedules. */
  score: z.union([z.string(), z.object({ displayValue: z.string() })]).optional(),
  linescores: z.array(z.object({ displayValue: z.string() })).optional(),
  team: EspnTeam,
});
const EspnCompetition = z.object({
  id: z.string().optional(),
  date: z.string().optional(),
  status: EspnStatus,
  competitors: z.array(EspnCompetitor).length(2),
  situation: z.unknown().optional(),
});
const EspnEvent = z.object({
  id: z.string(),
  date: z.string(),
  week: z.object({ number: z.number().optional() }).optional(),
  competitions: z.array(EspnCompetition).min(1),
});
const Scoreboard = z.object({ week: z.object({ number: z.number() }).optional(), events: z.array(EspnEvent).default([]) });
const Schedule = z.object({ events: z.array(EspnEvent).default([]) });
const Summary = z.object({ header: z.object({ id: z.string(), competitions: z.array(EspnCompetition).min(1) }), situation: z.unknown().optional() });
/** ESPN's live "situation": `possession` is a team id; `downDistanceText` is display text. Every field may be missing. */
const EspnSituation = z.object({ possession: z.union([z.string(), z.number()]).optional(), downDistanceText: z.string().optional() });
const Teams = z.object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: EspnTeam })) })) })) });

// --- mapping -----------------------------------------------------------------

function teamRef(t: z.infer<typeof EspnTeam>): TeamRef {
  const nickname = t.name ?? t.shortDisplayName ?? t.displayName;
  return { abbr: t.abbreviation, name: t.displayName, nickname, location: t.location ?? t.displayName.replace(new RegExp(` ${nickname}$`), "") };
}

export function mapStatus(name: string): ScoreStatus {
  switch (name) {
    case "STATUS_FINAL":
    case "STATUS_FINAL_OVERTIME":
      return "final";
    case "STATUS_HALFTIME":
      return "halftime";
    case "STATUS_SCHEDULED":
    case "STATUS_POSTPONED":
    case "STATUS_CANCELED":
    case "STATUS_DELAYED":
      return "scheduled";
    default:
      return "in_progress"; // STATUS_IN_PROGRESS, STATUS_END_PERIOD, ...
  }
}

const scoreOf = (x: z.infer<typeof EspnCompetitor>) => Number((typeof x.score === "string" ? x.score : x.score?.displayValue) ?? 0);
const side = (c: z.infer<typeof EspnCompetition>, ha: "home" | "away") => c.competitors.find((x) => x.homeAway === ha)!;

function toGameRef(e: z.infer<typeof EspnEvent>): GameRef {
  const c = e.competitions[0]!;
  return {
    gameId: e.id,
    kickoff: e.date,
    status: mapStatus(c.status.type.name),
    home: teamRef(side(c, "home").team),
    away: teamRef(side(c, "away").team),
    label: e.week?.number ? `Week ${e.week.number}` : "",
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const byKickoffDesc = (a: GameRef, b: GameRef) => Date.parse(b.kickoff) - Date.parse(a.kickoff);

// --- adapter -----------------------------------------------------------------

/** How far ahead a pool can be posted for a game that has not started. */
const UPCOMING_DAYS = 60;

export class EspnNfl implements ScoreProvider, GameDirectory {
  private teams?: Promise<TeamRef[]>;

  constructor(
    private readonly get: Fetcher = defaultFetcher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getScore(gameId: string): Promise<ScoreSnapshot> {
    const raw = await this.get(`${BASE}/summary?event=${encodeURIComponent(gameId)}`);
    const fetchedAt = this.now().toISOString();
    const parsed = Summary.parse(raw);
    const c = parsed.header.competitions[0]!;
    const home = side(c, "home");
    const away = side(c, "away");
    const pts = (x: typeof home) => (x.linescores ?? []).map((l) => Number(l.displayValue));
    const status = mapStatus(c.status.type.name);
    // Only trust a possession while play is on; the source may put the block on the summary or on the competition.
    const sit = status === "in_progress" ? EspnSituation.safeParse(parsed.situation ?? c.situation) : undefined;
    const ball = sit?.success && sit.data.possession !== undefined ? String(sit.data.possession) : undefined;
    const possession = ball === undefined ? undefined : ball === home.team.id ? "home" : ball === away.team.id ? "away" : undefined;
    const downDistance = sit?.success ? sit.data.downDistanceText : undefined;
    // Period points are only meaningful once play has started; before that ESPN may send placeholders.
    const periods = status === "scheduled" ? { home: [], away: [] } : { home: pts(home), away: pts(away) };
    return ScoreSnapshotSchema.parse({
      gameId: parsed.header.id,
      league: "nfl",
      source: "espn",
      fetchedAt,
      kickoff: c.date ? new Date(c.date).toISOString() : undefined,
      status,
      statusDetail: c.status.type.detail ?? c.status.type.name,
      home: teamRef(home.team),
      away: teamRef(away.team),
      periods,
      total: status === "scheduled" ? { home: 0, away: 0 } : { home: scoreOf(home), away: scoreOf(away) },
      situation: possession || downDistance ? { possession, downDistance } : undefined,
    });
  }

  private async nflTeams(): Promise<TeamRef[]> {
    this.teams ??= this.get(`${BASE}/teams?limit=40`).then((raw) =>
      Teams.parse(raw).sports.flatMap((s) => s.leagues.flatMap((l) => l.teams.map((t) => teamRef(t.team)))),
    );
    try {
      return await this.teams;
    } catch (e) {
      this.teams = undefined; // don't cache a failure
      throw e;
    }
  }

  /** Teams whose location/nickname/name/abbr appears in the text, or the text appears in it. */
  async findTeams(text: string): Promise<TeamRef[]> {
    const q = norm(text);
    if (q.length < 2) return [];
    const padded = ` ${q} `;
    return (await this.nflTeams()).filter((t) =>
      [t.name, t.nickname, t.location, t.abbr].map(norm).some((a) => padded.includes(` ${a} `) || (q.length >= 3 && a.startsWith(q))),
    );
  }

  async recent(limit = 8): Promise<GameRef[]> {
    const current = Scoreboard.parse(await this.get(`${BASE}/scoreboard`));
    const games = current.events.map(toGameRef);
    // Walk back through earlier weeks until there are enough played games.
    for (let wk = (current.week?.number ?? 1) - 1; wk >= 1 && games.filter((g) => this.eligible(g)).length < limit; wk--) {
      const sb = Scoreboard.parse(await this.get(`${BASE}/scoreboard?seasontype=2&week=${wk}`));
      games.push(...sb.events.map(toGameRef));
    }
    return games
      .filter((g) => this.eligible(g))
      .sort(byKickoffDesc)
      .slice(0, limit);
  }

  async upcoming(query?: string, limit = 8): Promise<GameRef[]> {
    const now = this.now().getTime();
    const horizon = now + UPCOMING_DAYS * 86_400_000;
    const soon = (g: GameRef) => g.status === "scheduled" && Date.parse(g.kickoff) > now && Date.parse(g.kickoff) < horizon;
    const byKickoff = (a: GameRef, b: GameRef) => Date.parse(a.kickoff) - Date.parse(b.kickoff);
    const games = new Map<string, GameRef>();
    if (query?.trim()) {
      const teams = [...new Map((await this.findTeams(query)).map((t) => [t.abbr, t])).values()];
      for (const g of (await Promise.all(teams.map((t) => this.scheduleOf(t)))).flat()) if (soon(g)) games.set(g.gameId, g);
      // Games with every named team first ("eagles chiefs" finds their meeting before either team's other games).
      const hits = (g: GameRef) => teams.filter((t) => t.abbr === g.home.abbr || t.abbr === g.away.abbr).length;
      return [...games.values()].sort((a, b) => hits(b) - hits(a) || byKickoff(a, b)).slice(0, limit);
    }
    const current = Scoreboard.parse(await this.get(`${BASE}/scoreboard`));
    for (const e of current.events.map(toGameRef)) if (soon(e)) games.set(e.gameId, e);
    // Walk forward through the coming weeks until there are enough.
    for (let wk = (current.week?.number ?? 0) + 1; current.week?.number && wk <= 18 && games.size < limit; wk++) {
      const sb = Scoreboard.parse(await this.get(`${BASE}/scoreboard?seasontype=2&week=${wk}`));
      for (const e of sb.events.map(toGameRef)) if (soon(e)) games.set(e.gameId, e);
    }
    return [...games.values()].sort(byKickoff).slice(0, limit);
  }

  /** Started/finished games, plus ones kicking off within a day and a half (pools get made before the game). */
  private eligible(g: GameRef): boolean {
    return g.status !== "scheduled" || Date.parse(g.kickoff) - this.now().getTime() < 36 * 3600_000;
  }

  private async scheduleOf(team: TeamRef): Promise<GameRef[]> {
    const raw = await this.get(`${BASE}/teams/${team.abbr.toLowerCase()}/schedule`);
    return Schedule.parse(raw).events.map(toGameRef);
  }

  async forTeams(topTeam: string, leftTeam?: string, limit = 5): Promise<GameRef[]> {
    const wanted = (await Promise.all([this.findTeams(topTeam), leftTeam ? this.findTeams(leftTeam) : []])).flat();
    return this.rank(wanted, limit);
  }

  async search(query: string, limit = 8): Promise<GameRef[]> {
    return this.rank(await this.findTeams(query), limit);
  }

  /** Games involving the teams: started ones newest first, and games with all given teams ahead of the rest. */
  private async rank(teams: TeamRef[], limit: number): Promise<GameRef[]> {
    const unique = [...new Map(teams.map((t) => [t.abbr, t])).values()];
    if (unique.length === 0) return [];
    const games = new Map<string, GameRef>();
    for (const g of (await Promise.all(unique.map((t) => this.scheduleOf(t)))).flat()) games.set(g.gameId, g);
    const hits = (g: GameRef) => unique.filter((t) => t.abbr === g.home.abbr || t.abbr === g.away.abbr).length;
    return [...games.values()]
      .filter((g) => this.eligible(g))
      .sort((a, b) => hits(b) - hits(a) || byKickoffDesc(a, b))
      .slice(0, limit);
  }
}
