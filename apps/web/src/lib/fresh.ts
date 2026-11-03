import { freshness, type ScoreSnapshot } from "@bpc/engine";

export type BadgeTone = "live" | "final" | "stale" | "pregame";
export interface Badge {
  tone: BadgeTone;
  text: string;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * What to tell the user about a score's age. `nowMs` is the server's clock advanced by local elapsed time
 * (not the phone clock), and `offline` means the last refresh failed or the device is offline.
 * Anything that isn't a fresh online fetch of an in-progress game says "not live".
 */
export function badge(s: ScoreSnapshot, nowMs: number, offline: boolean): Badge {
  const f = freshness(s, new Date(nowMs));
  if (f === "final") return { tone: "final", text: offline ? `Final · saved ${clock(s.fetchedAt)}` : "Final" };
  if (f === "pregame") return { tone: "pregame", text: offline ? "Offline · game not started" : "Game not started" };
  if (f === "live" && !offline) {
    const sec = Math.max(0, Math.round((nowMs - Date.parse(s.fetchedAt)) / 1000));
    return { tone: "live", text: `Live · updated ${sec}s ago` };
  }
  return { tone: "stale", text: `${offline ? "Offline · " : ""}Updated ${clock(s.fetchedAt)}, not live` };
}
