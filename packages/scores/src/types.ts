import type { ScoreSnapshot, TeamRef } from "@bpc/engine";

/** A game a pool can be attached to. */
export interface GameRef {
  gameId: string;
  kickoff: string;
  status: ScoreSnapshot["status"];
  home: TeamRef;
  away: TeamRef;
  /** e.g. "Week 8". */
  label: string;
}

export interface ScoreProvider {
  /** Always hits the source; callers own caching. Throws if the game is unknown. */
  getScore(gameId: string): Promise<ScoreSnapshot>;
}

export interface GameDirectory {
  /** Most recent games league-wide (newest first), for when we don't know the teams. */
  recent(limit?: number): Promise<GameRef[]>;
  /** Games between/involving the named teams, most recent first. Games involving both teams rank first. */
  forTeams(topTeam: string, leftTeam?: string, limit?: number): Promise<GameRef[]>;
  /**
   * Games that have not started, soonest first, up to about two months ahead: what a pool is posted for before its game.
   * With a team name or two ("eagles", "eagles chiefs"), that team's schedule (playoffs included);
   * without, the next few weeks league-wide.
   */
  upcoming(query?: string, limit?: number): Promise<GameRef[]>;
  /** Free-text search ("eagles commanders", "new york"). */
  search(query: string, limit?: number): Promise<GameRef[]>;
}
