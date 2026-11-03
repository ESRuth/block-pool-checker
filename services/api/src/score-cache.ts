import type { ScoreSnapshot } from "@bpc/engine";
import type { ScoreProvider } from "@bpc/scores";

/**
 * Per-game cache so many phones watching one game cost one upstream call per TTL.
 * If the upstream fails we serve the last snapshot with its ORIGINAL fetchedAt, so freshness() reports it stale.
 */
export class CachedScores implements ScoreProvider {
  private readonly cache = new Map<string, { snap: ScoreSnapshot; at: number }>();
  private readonly inflight = new Map<string, Promise<ScoreSnapshot>>();

  constructor(
    private readonly inner: ScoreProvider,
    private readonly ttlMs = 20_000,
    private readonly now: () => number = Date.now,
  ) {}

  async getScore(gameId: string): Promise<ScoreSnapshot> {
    const hit = this.cache.get(gameId);
    // Finals don't change; keep them for much longer.
    const ttl = hit?.snap.status === "final" ? 10 * 60_000 : this.ttlMs;
    if (hit && this.now() - hit.at < ttl) return hit.snap;

    let p = this.inflight.get(gameId);
    if (!p) {
      p = this.inner
        .getScore(gameId)
        .then((snap) => {
          this.cache.set(gameId, { snap, at: this.now() });
          return snap;
        })
        .catch((e) => {
          if (!hit) throw e;
          this.cache.set(gameId, { snap: hit.snap, at: this.now() }); // back off for a TTL; snap keeps its old fetchedAt
          return hit.snap;
        })
        .finally(() => this.inflight.delete(gameId));
      this.inflight.set(gameId, p);
    }
    return p;
  }
}
