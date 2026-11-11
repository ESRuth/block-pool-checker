import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { SheetDocSchema, type SheetDoc } from "@bpc/engine";
import type { Access, HeaderSource } from "../access.js";
import { PIN_RE, hashPin, type PinKind, type PinState, type Pins } from "../pins.js";
import { newSheetId, type SheetPhotoStore, type SheetRecord, type SheetRepository } from "../sheets.js";
import type { VenueRepository } from "../venues.js";

/** A sheet is removed this long after the game (or after the day the sheet was made, if later; editing does not move it): the QR stays up all year, but the names behind it should not. Its photo goes with it; the bucket's 60-day lifecycle rule is the backstop. */
export const RETENTION_DAYS = 7;
const DAY = 86_400_000;

/**
 * Saved sheets. Every sheet is on a venue. The owner code, a runner of the venue, and the personal key of whoever made the sheet can change it.
 * Everyone else needs a pass (earned with the venue's PIN, or the sheet's own) to see it, and never gets the photo unless a runner allows it.
 */
export function sheetRoutes(app: Hono, a: Access, allSheets: SheetRepository, photos: SheetPhotoStore, venues: VenueRepository, pins: Pins) {
  const { now, ownerOnly } = a;

  // Deleted sheets (soft delete) do not exist as far as most routes below are concerned; only opening a sheet, restoring it, the lists and the owner's erase see them.
  const sheets: SheetRepository = {
    get: async (id) => {
      const r = await allSheets.get(id);
      return r && !r.deletedAt ? r : null;
    },
    put: (r) => allSheets.put(r),
    delete: (id) => allSheets.delete(id),
    listAll: async () => (await allSheets.listAll()).filter((r) => !r.deletedAt),
    listByCreator: async (id) => (await allSheets.listByCreator(id)).filter((r) => !r.deletedAt),
    listByVenue: async (id) => (await allSheets.listByVenue(id)).filter((r) => !r.deletedAt),
  };

  /** Removal date: the later of the game and the day the sheet was made, plus the retention. Editing a sheet does not move it. */
  const sheetExpiry = (doc: SheetDoc, madeAt: string) => {
    let base = Date.parse(madeAt);
    const kickoff = Date.parse(doc.game.kickoff);
    if (Number.isFinite(kickoff)) base = Math.max(base, kickoff);
    return new Date(base + RETENTION_DAYS * DAY).toISOString();
  };

  /** What asks for a PIN here: the sheet's own PIN, else its venue's. "orphan" = no venue any more, or an older sheet from before every sheet had one (only editors get in). */
  type Lock = { kind: PinKind; id: string; version: number; state: PinState; save: (p: { pinFails: number; pinLockedUntil?: string }) => Promise<void> };
  const lockOf = async (rec: SheetRecord): Promise<Lock | "orphan"> => {
    if (rec.pinHash)
      return {
        kind: "s",
        id: rec.id,
        version: rec.pinVersion ?? 1,
        state: rec,
        save: async (p) => {
          const cur = await sheets.get(rec.id);
          if (cur) await sheets.put({ ...cur, ...p });
        },
      };
    if (!rec.venueId) return "orphan";
    const v = await venues.get(rec.venueId);
    if (!v) return "orphan";
    return {
      kind: "v",
      id: v.id,
      version: v.pinVersion,
      state: v,
      save: async (p) => {
        const cur = await venues.get(v.id);
        if (cur) await venues.put({ ...cur, ...p });
      },
    };
  };
  const sheetView = (rec: SheetRecord) => ({
    id: rec.id,
    doc: rec.doc,
    title: rec.title,
    venueId: rec.venueId,
    hasPhoto: rec.hasPhoto,
    createdBy: rec.createdBy,
    updatedBy: rec.updatedBy,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    expiresAt: rec.expiresAt,
  });
  /** Who can change a sheet: the owner code, the personal key of whoever made it, or a runner of its venue. */
  const sheetAuthorized = async (c: HeaderSource, rec: SheetRecord) => {
    const who = await a.access(c, false);
    if (!who) return false;
    if (who.owner || who.id === rec.createdById) return true;
    return !!rec.venueId && !!(await venues.get(rec.venueId))?.runnerIds.includes(who.id);
  };

  /** Make a sheet from a photo on a venue (a runner of it, or the owner). It starts as a draft: only the people who run the venue see it until a runner publishes it. */
  app.post("/api/sheets", async (c) => {
    const who = await a.access(c);
    if (!who) return c.json({ error: "access code required" }, 403);
    const b = z.object({ venueId: z.string().max(40), doc: SheetDocSchema }).parse(await c.req.json());
    const v = await venues.get(b.venueId);
    if (!v) return c.json({ error: "not found" }, 404);
    if (!(who.owner || v.runnerIds.includes(who.id))) return c.json({ error: "you don't run this venue" }, 403);
    const t = now().toISOString();
    const rec: SheetRecord = {
      id: newSheetId(),
      doc: b.doc,
      hasPhoto: false,
      createdBy: who.name,
      createdById: who.id,
      updatedBy: who.name,
      venueId: v.id,
      draft: true,
      createdAt: t,
      updatedAt: t,
      expiresAt: sheetExpiry(b.doc, t),
    };
    await sheets.put(rec);
    return c.json(sheetView(rec), 201);
  });

  app.get("/api/sheets/:id", async (c) => {
    const rec = await allSheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    const canEdit = await sheetAuthorized(c, rec);
    // A deleted sheet is opened only by the people who could edit it, read-only, so they can restore it (the owner can also erase it).
    if ((rec.deletedAt || rec.draft || rec.posted) && !canEdit) return c.json({ error: "not found" }, 404); // posted and draft sheets are seen only by the people who run them
    const deleted = rec.deletedAt ? { at: rec.deletedAt, goneOn: rec.expiresAt, canErase: (await a.access(c, false))?.owner === true } : undefined;
    const lock = await lockOf(rec);
    if (!canEdit) {
      if (lock === "orphan") return c.json({ error: "not found" }, 404);
      // Only the title is shown before the PIN: nothing about the sheet itself.
      if (!pins.valid(c, lock.kind, lock.id, lock.version)) return c.json({ error: "PIN required", pinRequired: true, title: rec.title ?? "" }, 401);
    }
    const photoVisible = canEdit || !!rec.showPhoto;
    const view = sheetView(rec);
    // Marked blocks are the editor's own: someone with only the PIN never receives them.
    return c.json({
      ...view,
      doc: canEdit ? view.doc : { ...view.doc, mine: [] },
      hasPhoto: rec.hasPhoto && photoVisible && !rec.deletedAt,
      canEdit,
      ...(deleted ? { deleted } : {}),
      ...(canEdit ? { settings: { venueId: rec.venueId, showPhoto: !!rec.showPhoto, hasPin: !!rec.pinHash, draft: !!rec.draft, posted: !!rec.posted } } : {}),
    });
  });

  /** Enter the PIN that protects this sheet (its own, else its venue's). A right PIN sets a pass cookie; wrong tries slow down and then lock. */
  app.post("/api/sheets/:id/enter", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    const lock = await lockOf(rec);
    if (lock === "orphan" || rec.draft || rec.posted) return c.json({ error: "not found" }, 404);
    const { pin } = z.object({ pin: z.string().max(20) }).parse(await c.req.json());
    const r = await pins.attempt(
      c,
      lock.kind,
      lock.id,
      async () => {
        const cur = lock.kind === "s" ? await allSheets.get(lock.id) : await venues.get(lock.id);
        return cur;
      },
      pin,
      lock.save,
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error, retryAfter: r.retryAfter }, r.status);
  });

  /**
   * Name, photo visibility, own PIN and published state of a sheet. Editors only.
   * A new PIN signs out everyone who entered the old one.
   */
  app.patch("/api/sheets/:id/settings", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "you cannot change this sheet" }, 403);
    const b = z
      .object({
        title: z.string().trim().max(80).nullable().optional(),
        showPhoto: z.boolean().optional(),
        pin: z.string().regex(PIN_RE, "A PIN is 4 to 8 digits.").nullable().optional(),
        draft: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const next: SheetRecord = { ...rec, updatedAt: now().toISOString() };
    if (b.title !== undefined) next.title = b.title || undefined;
    if (b.showPhoto !== undefined) next.showPhoto = b.showPhoto;
    if (b.pin !== undefined) {
      next.pinHash = b.pin ? hashPin(b.pin) : undefined;
      next.pinVersion = (rec.pinVersion ?? 0) + 1;
      next.pinFails = undefined;
      next.pinLockedUntil = undefined;
    }
    // Publish (draft: false) or take back to a draft (draft: true). A sheet still waiting for its photo cannot be published.
    if (b.draft !== undefined && !next.posted) next.draft = b.draft || undefined;
    await sheets.put(next);
    return c.json({
      ...sheetView(next),
      settings: { venueId: next.venueId, showPhoto: !!next.showPhoto, hasPin: !!next.pinHash, draft: !!next.draft, posted: !!next.posted },
    });
  });

  /** The sheets this person made (all sheets for the owner), for the My Sheets page. */
  app.get("/api/my/sheets", async (c) => {
    const who = await a.access(c, false);
    if (!who) return c.json({ error: "access code required" }, 403);
    const list = who.owner ? await allSheets.listAll() : await allSheets.listByCreator(who.id); // the owner sees every sheet; deleted ones are listed too, marked, until they expire
    return c.json({
      sheets: list.map((r) => ({
        id: r.id,
        createdBy: r.createdBy,
        teams: r.doc.teams,
        kickoff: r.doc.game.kickoff,
        label: r.doc.game.label,
        title: r.title,
        deletedAt: r.deletedAt,
        goneOn: r.deletedAt ? r.expiresAt : undefined,
        draft: r.draft || undefined,
        posted: r.posted || undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  });

  app.put("/api/sheets/:id", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "you cannot change this sheet" }, 403);
    const doc = SheetDocSchema.parse(await c.req.json());
    const who = await a.access(c, false);
    const next: SheetRecord = {
      ...rec,
      doc,
      updatedBy: who?.name ?? rec.updatedBy,
      updatedAt: now().toISOString(),
      expiresAt: sheetExpiry(doc, rec.createdAt),
    };
    await sheets.put(next);
    if (next.expiresAt !== rec.expiresAt) await photos.setExpiry(next.id, next.expiresAt).catch(() => undefined);
    return c.json(sheetView(next));
  });

  /**
   * "Delete" hides the sheet everywhere at once but keeps it (and its photo) until its normal expiry, so the owner can restore one that was
   * deleted by mistake. Names stay in storage until then, reachable only through the owner's routes.
   */
  app.delete("/api/sheets/:id", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "you cannot change this sheet" }, 403);
    await sheets.put({ ...rec, deletedAt: now().toISOString() });
    return c.body(null, 204);
  });

  /** Undo a delete: whoever could edit the sheet (its maker, a runner of its venue, the owner) brings it back whole. */
  app.post("/api/sheets/:id/restore", async (c) => {
    const rec = await allSheets.get(c.req.param("id"));
    if (!rec?.deletedAt) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "you cannot change this sheet" }, 403);
    await allSheets.put({ ...rec, deletedAt: undefined });
    return c.json({ id: rec.id });
  });

  /** Delete a hidden sheet and its photo for good, without waiting for the expiry. Owner only: runners can undo a delete but not make it permanent. */
  app.delete("/api/owner/sheets/:id", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const rec = await allSheets.get(c.req.param("id"));
    if (!rec?.deletedAt) return c.json({ error: "not found" }, 404);
    await photos.delete(rec.id);
    await allSheets.delete(rec.id);
    return c.body(null, 204);
  });

  /** The phone already shrank the photo (max 2048 px); this is the hard cap. */
  app.put("/api/sheets/:id/photo", bodyLimit({ maxSize: 6 * 1024 * 1024, onError: (c) => c.json({ error: "image too large" }, 413) }), async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) return c.json({ error: "you cannot change this sheet" }, 403);
    if ((c.req.header("Content-Type") ?? "").split(";")[0]!.trim() !== "image/jpeg") return c.json({ error: "send a JPEG" }, 415);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return c.json({ error: "empty body" }, 400);
    await photos.put(rec.id, bytes, rec.expiresAt);
    // The photo is what takes a posted sheet to the next stage: it joins the venue as a draft, to be checked before it is published.
    await sheets.put({ ...rec, hasPhoto: true, posted: undefined, draft: rec.posted ? true : rec.draft, updatedAt: now().toISOString() });
    return c.body(null, 204);
  });

  app.get("/api/sheets/:id/photo", async (c) => {
    const rec = await sheets.get(c.req.param("id"));
    if (!rec?.hasPhoto) return c.json({ error: "not found" }, 404);
    // Photos show handwriting and phone numbers: they go only to editors, or to viewers the runner allowed them for.
    const lock = await lockOf(rec);
    if ((rec.draft || rec.posted) && !(await sheetAuthorized(c, rec))) return c.json({ error: "not found" }, 404);
    if (!(await sheetAuthorized(c, rec))) {
      if (lock === "orphan" || !pins.valid(c, lock.kind, lock.id, lock.version)) return c.json({ error: "PIN required" }, 401);
      if (!rec.showPhoto) return c.json({ error: "the photo is only for the people who run this sheet" }, 403);
    }
    const bytes = await photos.get(rec.id);
    if (!bytes) return c.json({ error: "not found" }, 404);
    return c.body(bytes as unknown as ArrayBuffer, 200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" });
  });
}
