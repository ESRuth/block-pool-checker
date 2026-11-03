import { useCallback, useEffect, useState } from "react";
import type { ScoreSnapshot } from "@bpc/engine";
import { loadScore, storeScore, type StoredScore } from "../lib/gameApi";

const POLL_MS = 20_000;

/** Polls a score feed. `key` names the stored copy; anything restored from storage reads as not live until a fetch succeeds. */
export function useScore<T extends { serverTime: string; snapshot: ScoreSnapshot }>(key: string, load: () => Promise<T>, enabled: boolean) {
  const [stored, setStored] = useState<StoredScore<T> | null>(() => loadScore<T>(key));
  // Until a fetch succeeds in this session, anything we show came from storage and must read as not live.
  const [fresh, setFresh] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

  // A different feed (e.g. the user picked another game): start from its stored copy, not live until fetched.
  useEffect(() => {
    setStored(loadScore<T>(key));
    setFresh(false);
    setFailed(false);
  }, [key]);

  const refresh = useCallback(async () => {
    try {
      const data = await load();
      const s = { data, receivedAt: Date.now() };
      storeScore(key, s);
      setStored(s);
      setFresh(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const final = stored?.data.snapshot.status === "final" && fresh;

  useEffect(() => {
    if (!enabled) return;
    refresh();
    if (final) return;
    const poll = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    const wake = () => refresh();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, final, refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const offline = failed || !fresh || !navigator.onLine;
  // Server clock advanced by local elapsed time.
  const serverNow = stored ? Date.parse(stored.data.serverTime) + (now - stored.receivedAt) : now;
  return { score: stored?.data ?? null, offline, serverNow, refresh };
}
