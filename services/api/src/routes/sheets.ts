import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SheetDocSchema, type SheetDoc } from "@bpc/engine";
import type { Access, HeaderSource } from "../access.js";
import { hashToken, newEditToken, tokenMatches } from "../ids.js";
import { newSheetId, type SheetPhotoStore, type SheetRecord, type SheetRepository } from "../sheets.js";

/** A sheet is removed this long after the game (or after its last edit, if later). Its photo goes with it; the bucket's 60-day lifecycle rule is the backstop. */
export const RETENTION_DAYS = 30;
const DAY = 86_400_000;

/**
 * Saved sheets. The link holds the id (view); the edit token (kept in the link's #fragment, only ever sent as a header) allows changes.
 * A personal key belonging to whoever made the sheet, and the owner code, also edit it.
 */
export function sheetRoutes(app: Hono, a: Access, sheets: SheetRepository, photos: SheetPhotoStore) {
  const { now } = a;

  const sheetExpiry = async (doc: SheetDoc) => {
    let base = now().getTime();
    const kickoff = Date.parse(doc.game.kickoff);
    if (Number.isFinite(kickoff)) base = Math.max(base, kickoff);
    return new Date(base + RETENTION_DAYS * DAY).toISOString();
  };
  const sheetView = (rec: SheetRecord) => ({
    id: rec.id,
    doc: rec.doc,
    hasPhoto: rec.hasPhoto,
    createdBy: rec.createdBy,
    updatedBy: rec.updatedBy,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    expiresAt: rec.expiresAt,
  });
  /** The edit link's token, or a personal key belonging to whoever made the sheet (the owner code can edit any). */
  const sheetAuthorized = async (c: HeaderSource, rec: SheetRecord) => {
    const m = /^Bearer (.+)$/.exec(c.req.header("Authorization") ?? "");
    if (m && [rec.editTokenHash, ...(rec.extraEditTokenHashes ?? [])].some((h) => tokenMatches(m[1]!, h))) return true;
    if (!a.hasOwnerCode) return false; // without access control (local dev) only the edit link can edit
    const who = await a.access(c, false);
    return !!who && (who.owner || who.id === rec.createdById);
  };

  app.post("/api/sheets", async (c) => {
    const who = await a.access(c);
    if (!who) return c.json({ error: "invite code required" }, 403);
    const doc = SheetDocSchema.parse(await c.req.json());
    const id = newSheetId();
    const editToken = newEditToken();
    const t = now().toISOString();
    const rec: SheetRecord = {
      id,
      editTokenHash: hashToken(editToken),
      doc,
      hasPhoto: false,
      createdBy: who.name,
      createdById: who.id,
      updatedBy: who.name,
      createdAt: t,
      updatedAt: t,
      expiresAt: await sheetExpiry(doc),
    };
    await sheets.put(rec);
    return c.json({ ...sheetView(rec), editToken }, 201); // the token is shown exactly once
  });

  app.get("/api/sheets/:id", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    const canEdit = await sheetAuthorized(c, rec);
    const view = sheetView(rec);
    // Marked squares are the editor's own: someone with only the view link never receives them.
    return c.json({ ...view, doc: canEdit ? view.doc : { ...view.doc, mine: [] }, canEdit });
  });

  /** A new edit link for a sheet the caller made (or the owner): the original token is never stored, so this is how to get one again. Older links keep working. */
  app.post("/api/sheets/:id/edit-links", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    const who = await a.access(c, false);
    if (!a.hasOwnerCode || !who || !(who.owner || who.id === rec.createdById))
      return c.json({ error: "only the person who made this sheet can make edit links" }, 403);
    const editToken = newEditToken();
    const extra = [...(rec.extraEditTokenHashes ?? []), hashToken(editToken)].slice(-20);
    await sheets.put({ ...rec, extraEditTokenHashes: extra });
    return c.json({ editToken }, 201);
  });

  /** The sheets this person made (all sheets for the owner), for the My Sheets page. No edit tokens are needed: their personal key is their edit access. */
  app.get("/api/my/sheets", async (c) => {
    const who = await a.access(c, false);
    if (!who) return c.json({ error: "invite code required" }, 403);
    const list = who.owner ? await sheets.listAll() : await sheets.listByCreator(who.id); // the owner sees every sheet
    return c.json({
      sheets: list.map((r) => ({
        id: r.id,
        createdBy: r.createdBy,
        teams: r.doc.teams,
        kickoff: r.doc.game.kickoff,
        label: r.doc.game.label,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  });

  app.put("/api/sheets/:id", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "edit token required" }, 403);
    const doc = SheetDocSchema.parse(await c.req.json());
    const who = await a.access(c, false); // a shared edit link works without a personal key; then nobody is credited
    const next: SheetRecord = { ...rec, doc, updatedBy: who?.name ?? rec.updatedBy, updatedAt: now().toISOString(), expiresAt: await sheetExpiry(doc) };
    await sheets.put(next);
    return c.json(sheetView(next));
  });

  app.delete("/api/sheets/:id", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "edit token required" }, 403);
    await photos.delete(rec.id);
    await sheets.delete(rec.id);
    return c.body(null, 204);
  });

  /** The phone already shrank the photo (max 2048 px); this is the hard cap. */
  app.put("/api/sheets/:id/photo", bodyLimit({ maxSize: 6 * 1024 * 1024, onError: (c) => c.json({ error: "image too large" }, 413) }), async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "edit token required" }, 403);
    if ((c.req.header("Content-Type") ?? "").split(";")[0]!.trim() !== "image/jpeg") return c.json({ error: "send a JPEG" }, 415);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return c.json({ error: "empty body" }, 400);
    await photos.put(rec.id, bytes);
    await sheets.put({ ...rec, hasPhoto: true, updatedAt: now().toISOString() });
    return c.body(null, 204);
  });

  app.get("/api/sheets/:id/photo", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec?.hasPhoto) return c.json({ error: "not found" }, 404);
    const bytes = await photos.get(rec.id);
    if (!bytes) return c.json({ error: "not found" }, 404);
    return c.body(bytes as unknown as ArrayBuffer, 200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" });
  });
}
