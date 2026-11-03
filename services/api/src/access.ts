import { MemoryUserRepository, hashToken as hashKey, type UserRepository } from "./users.js";
import { tokenMatches } from "./ids.js";

export interface AccessDeps {
  users?: UserRepository;
  inviteCode?: string;
  dailyReadCap?: number;
  now?: () => Date;
}

/** Anything with a `req.header()`: a Hono context, or a stand-in in tests. */
export type HeaderSource = { req: { header(n: string): string | undefined } };
export interface Who {
  id: string;
  name: string;
  owner: boolean;
}

const OWNER = "Owner";

/**
 * Who is asking, and how much they may spend. The owner code (INVITE_CODE) is the master key and runs /admin;
 * everyone else uses a personal key the owner made for them.
 */
export function createAccess(deps: AccessDeps) {
  const now = deps.now ?? (() => new Date());
  const users: UserRepository = deps.users ?? new MemoryUserRepository();
  const readCap = deps.dailyReadCap ?? 40;

  /** The person behind the X-Invite-Code header, or null. With no owner code configured (local dev) everything is open. `count` records the use for cost tracking. */
  async function access(c: HeaderSource, count = true): Promise<Who | null> {
    const key = c.req.header("X-Invite-Code");
    if (!deps.inviteCode) return { id: "owner", name: OWNER, owner: true };
    if (!key) return null;
    if (tokenMatches(key, hashKey(deps.inviteCode))) return { id: "owner", name: OWNER, owner: true };
    const u = await users.byKeyHash(hashKey(key));
    if (!u || u.revoked) return null;
    if (count) await users.put({ ...u, uses: u.uses + 1, lastUsedAt: now().toISOString() }).catch(() => undefined);
    return { id: u.id, name: u.name, owner: false };
  }

  const ownerOnly = async (c: HeaderSource) => (await access(c, false))?.owner === true;

  /** Counts a model read against an invited person's daily cap. Returns false when they are over it (nothing is spent then). */
  async function underReadCap(who: { id: string; owner: boolean }): Promise<boolean> {
    if (who.owner || !deps.inviteCode || readCap <= 0) return true;
    const u = await users.get(who.id);
    if (!u) return true;
    const day = now().toISOString().slice(0, 10);
    const n = u.readDay === day ? (u.readsToday ?? 0) : 0;
    if (n >= readCap) return false;
    await users.put({ ...u, readDay: day, readsToday: n + 1 }).catch(() => undefined);
    return true;
  }

  return { access, ownerOnly, underReadCap, users, now, hasOwnerCode: !!deps.inviteCode };
}
export type Access = ReturnType<typeof createAccess>;
