import type { ScoreSnapshot } from "@bpc/engine";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw Object.assign(new Error(`${res.status}`), { status: res.status });
  return res.json();
}

export interface GameRef {
  gameId: string;
  kickoff: string;
  status: "scheduled" | "in_progress" | "halftime" | "final";
  home: { abbr: string; name: string; nickname: string };
  away: { abbr: string; name: string; nickname: string };
  label: string;
}
export interface GameScore {
  snapshot: ScoreSnapshot;
  freshness: string;
  serverTime: string;
}
export const fetchGameScore = (gameId: string) => getJson<GameScore>(`/api/games/${encodeURIComponent(gameId)}/score`);
export const fetchGameSuggestions = (top: string, left: string) =>
  getJson<{ games: GameRef[] }>(`/api/games/suggest?top=${encodeURIComponent(top)}&left=${encodeURIComponent(left)}&limit=6`).then((r) => r.games);
export const searchGames = (q: string) => getJson<{ games: GameRef[] }>(`/api/games/search?q=${encodeURIComponent(q)}&limit=8`).then((r) => r.games);
/** Games that have not started yet, soonest first (up to about two months ahead); `q` narrows to one team's schedule. */
export const upcomingGames = (q?: string) =>
  getJson<{ games: GameRef[] }>(`/api/games/upcoming?limit=8${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) => r.games);
export const recentGames = () => getJson<{ games: GameRef[] }>("/api/games/recent?limit=8").then((r) => r.games);

// --- local storage ---------------------------------------------------------------

const read = <T>(k: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null");
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export interface StoredScore<T = GameScore> {
  data: T;
  /** Phone clock when `data` was received; used with serverTime to age the score without trusting the phone's clock. */
  receivedAt: number;
}
export const loadScore = <T = GameScore>(key: string) => read<StoredScore<T>>(`bpc.score.${key}`);
export const storeScore = <T = GameScore>(key: string, s: StoredScore<T>) => write(`bpc.score.${key}`, s);
