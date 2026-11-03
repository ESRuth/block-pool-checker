import type { Hono } from "hono";
import { z } from "zod";
import type { Access } from "../access.js";
import { hashToken as hashKey, newUserId, newUserKey } from "../users.js";

const userView = (u: { id: string; name: string; createdAt: string; lastUsedAt?: string; uses: number; revoked: boolean }) => ({
  id: u.id,
  name: u.name,
  createdAt: u.createdAt,
  lastUsedAt: u.lastUsedAt,
  uses: u.uses,
  revoked: u.revoked,
});

/** Who am I, and the owner's people list: invite someone, get them a fresh link, turn them off. */
export function adminRoutes(app: Hono, a: Access) {
  const { users, now, ownerOnly } = a;

  app.get("/api/me", async (c) => {
    const who = await a.access(c, false);
    return who ? c.json({ name: who.name, owner: who.owner }) : c.json({ error: "invite code required" }, 403);
  });

  app.get("/api/admin/users", async (c) =>
    !(await ownerOnly(c)) ? c.json({ error: "owner only" }, 403) : c.json({ users: (await users.list()).map(userView) }),
  );

  app.post("/api/admin/users", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(await c.req.json());
    const key = newUserKey();
    const u = { id: newUserId(), name, keyHash: hashKey(key), createdAt: now().toISOString(), uses: 0, revoked: false };
    await users.put(u);
    return c.json({ ...userView(u), key }, 201); // the key is shown exactly once, to put in their personal link
  });

  /** A fresh personal link for someone already invited (the original key is never stored, so it cannot be shown again). Their older links keep working. */
  app.post("/api/admin/users/:id/links", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const u = await users.get(c.req.param("id"));
    if (!u) return c.json({ error: "not found" }, 404);
    if (u.revoked) return c.json({ error: "this person's links are turned off" }, 409);
    const key = newUserKey();
    await users.put({ ...u, extraKeyHashes: [...(u.extraKeyHashes ?? []), hashKey(key)].slice(-20) });
    return c.json({ ...userView(u), key }, 201);
  });

  app.post("/api/admin/users/:id/revoke", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const u = await users.get(c.req.param("id"));
    if (!u) return c.json({ error: "not found" }, 404);
    await users.put({ ...u, revoked: true });
    return c.json(userView({ ...u, revoked: true }));
  });
}
