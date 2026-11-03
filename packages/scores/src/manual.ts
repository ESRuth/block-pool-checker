import type { ScoreSnapshot } from "@bpc/engine";
import type { ScoreProvider } from "./types.js";

/** Scores typed in by a person. Always source "manual", so the UI never shows them as live. */
export class ManualScoreProvider implements ScoreProvider {
  private readonly byGame = new Map<string, ScoreSnapshot>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Caller supplies everything except source/fetchedAt, which are stamped here. */
  set(entry: Omit<ScoreSnapshot, "source" | "fetchedAt">): ScoreSnapshot {
    const snap: ScoreSnapshot = { ...entry, source: "manual", fetchedAt: this.now().toISOString() };
    this.byGame.set(snap.gameId, snap);
    return snap;
  }

  async getScore(gameId: string): Promise<ScoreSnapshot> {
    const s = this.byGame.get(gameId);
    if (!s) throw new Error(`no manual score for game ${gameId}`);
    return s;
  }
}
