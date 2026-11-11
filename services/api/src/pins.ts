import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

/** A PIN is 4 to 8 digits: short enough to say out loud, so the server (not the PIN's length) is what stops guessing. */
export const PIN_RE = /^[0-9]{4,8}$/;
/** After this many wrong tries in a row the PIN locks, for longer each time. */
export const FREE_TRIES = 5;
const PASS_DAYS = 90;
const DAY = 86_400_000;

/** `salt.hash` (scrypt). Salted and slow, because a short PIN in a leaked database would otherwise fall at once. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("base64url")}.${scryptSync(pin, salt, 32).toString("base64url")}`;
}
export function pinMatches(pin: string, stored: string): boolean {
  const [s, h] = stored.split(".");
  if (!s || !h) return false;
  const want = Buffer.from(h, "base64url");
  const got = scryptSync(pin, Buffer.from(s, "base64url"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** How long a PIN stays locked after `fails` wrong tries in a row: nothing for the first few, then 1, 2, 4 … up to 60 minutes. */
export function lockMinutes(fails: number): number {
  return fails < FREE_TRIES ? 0 : Math.min(2 ** (fails - FREE_TRIES), 60);
}

/** What a PIN protects: a venue (all its sheets) or one sheet that has its own PIN. */
export type PinKind = "v" | "s";
/** The fields of a venue or sheet record that hold its PIN state. */
export interface PinState {
  pinHash?: string;
  pinVersion?: number;
  pinFails?: number;
  pinLockedUntil?: string;
}
export type PinResult = { ok: true } | { ok: false; status: 403 | 429; error: string; retryAfter?: number };

/**
 * PINs and the passes they earn. A pass is a signed, expiring cookie (HttpOnly, same-site, only sent to /api, so `<img>` photo loads carry it
 * and page scripts cannot read it). It names the PIN's version, so changing a PIN signs everyone out. Signing needs no storage.
 */
export function createPins(secret: string, now: () => Date) {
  const sign = (kind: PinKind, id: string, version: number, exp: number) =>
    createHmac("sha256", secret).update(`${kind}:${id}:${version}:${exp}`).digest("base64url");
  const cookieName = (id: string) => `bp_${id}`;

  function issue(c: Context, kind: PinKind, id: string, version: number) {
    const exp = now().getTime() + PASS_DAYS * DAY;
    const secure = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
    setCookie(c, cookieName(id), `${exp}.${version}.${sign(kind, id, version, exp)}`, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/api",
      maxAge: PASS_DAYS * 86_400,
      secure,
    });
  }

  function valid(c: Context, kind: PinKind, id: string, version: number): boolean {
    const [exp, ver, sig] = (getCookie(c, cookieName(id)) ?? "").split(".");
    if (!exp || !ver || !sig || Number(ver) !== version || !(Number(exp) > now().getTime())) return false;
    const want = Buffer.from(sign(kind, id, version, Number(exp)));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }

  /** Attempts on the same PIN run one at a time on this server, so a burst of guesses cannot all read the same failure count. */
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
    const result = (queues.get(key) ?? Promise.resolve()).then(run, run);
    const tail = result.catch(() => undefined);
    queues.set(key, tail);
    void tail.then(() => queues.get(key) === tail && queues.delete(key));
    return result;
  }

  /**
   * Check a PIN, count the miss or reset the count, and (on success) issue a pass. `load` reads the record's current PIN state (it is read
   * again inside the queue, so queued guesses each see the count left by the one before); `save` stores the changed fields.
   */
  function attempt(
    c: Context,
    kind: PinKind,
    id: string,
    load: () => Promise<PinState | null | undefined>,
    pin: string,
    save: (patch: Required<Pick<PinState, "pinFails">> & { pinLockedUntil?: string }) => Promise<void>,
  ): Promise<PinResult> {
    return serial(`${kind}:${id}`, async (): Promise<PinResult> => {
      const state = await load();
      if (!state?.pinHash) return { ok: false, status: 403, error: "This has no PIN." };
      const t = now().getTime();
      const until = state.pinLockedUntil ? Date.parse(state.pinLockedUntil) : 0;
      if (until > t) {
        const retryAfter = Math.ceil((until - t) / 1000);
        return { ok: false, status: 429, error: `Too many tries. Try again in ${Math.ceil(retryAfter / 60)} minute${retryAfter > 60 ? "s" : ""}.`, retryAfter };
      }
      if (PIN_RE.test(pin) && pinMatches(pin, state.pinHash)) {
        if (state.pinFails) await save({ pinFails: 0 });
        issue(c, kind, id, state.pinVersion ?? 1);
        return { ok: true };
      }
      const fails = (state.pinFails ?? 0) + 1;
      const mins = lockMinutes(fails);
      await save({ pinFails: fails, pinLockedUntil: mins ? new Date(t + mins * 60_000).toISOString() : undefined });
      return { ok: false, status: 403, error: "That PIN isn't right." };
    });
  }

  return { issue, valid, attempt };
}
export type Pins = ReturnType<typeof createPins>;
