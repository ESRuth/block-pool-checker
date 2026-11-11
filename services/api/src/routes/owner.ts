import type { Hono } from "hono";
import { z } from "zod";
import type { Access } from "../access.js";
import type { SheetRepository } from "../sheets.js";
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
export function ownerRoutes(app: Hono, a: Access, sheets: SheetRepository) {
  const { users, now, ownerOnly } = a;

  app.get("/api/me", async (c) => {
    const who = await a.access(c, false);
    return who ? c.json({ name: who.name, owner: who.owner }) : c.json({ error: "access code required" }, 403);
  });

  app.get("/api/owner/users", async (c) =>
    !(await ownerOnly(c)) ? c.json({ error: "owner only" }, 403) : c.json({ users: (await users.list()).map(userView) }),
  );

  app.post("/api/owner/users", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(await c.req.json());
    const key = newUserKey();
    const u = { id: newUserId(), name, keyHash: hashKey(key), createdAt: now().toISOString(), uses: 0, revoked: false };
    await users.put(u);
    return c.json({ ...userView(u), key }, 201); // the key is shown exactly once, to put in their personal link
  });

  /** A fresh personal link for someone already invited (the original key is never stored, so it cannot be shown again). Their older links keep working, unless `replace` is set. */
  app.post("/api/owner/users/:id/links", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const u = await users.get(c.req.param("id"));
    if (!u) return c.json({ error: "not found" }, 404);
    if (u.revoked) return c.json({ error: "this person's links are turned off" }, 409);
    // `replace` makes the new link the only one: every older link stops working (for a lost phone or a link sent to the wrong person).
    const { replace } = z.object({ replace: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
    const key = newUserKey();
    await users.put(
      replace ? { ...u, keyHash: hashKey(key), extraKeyHashes: [] } : { ...u, extraKeyHashes: [...(u.extraKeyHashes ?? []), hashKey(key)].slice(-20) },
    );
    return c.json({ ...userView(u), key }, 201);
  });

  /**
   * Rename someone. The name is shown as "Added by" on the sheets they made, so those follow (they are short-lived, so this keeps the list honest
   * rather than fixing history).
   */
  app.patch("/api/owner/users/:id", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(await c.req.json());
    const u = await users.get(c.req.param("id"));
    if (!u) return c.json({ error: "not found" }, 404);
    await users.put({ ...u, name });
    for (const r of await sheets.listByCreator(u.id)) {
      await sheets.put({ ...r, createdBy: name, updatedBy: r.updatedBy === u.name ? name : r.updatedBy });
    }
    return c.json(userView({ ...u, name }));
  });

  app.post("/api/owner/users/:id/revoke", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const u = await users.get(c.req.param("id"));
    if (!u) return c.json({ error: "not found" }, 404);
    await users.put({ ...u, revoked: true });
    return c.json(userView({ ...u, revoked: true }));
  });
}
