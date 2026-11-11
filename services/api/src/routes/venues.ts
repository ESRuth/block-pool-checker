import type { Hono } from "hono";
import { z } from "zod";
import { SheetDocSchema } from "@bpc/engine";
import { hashToken, newEditToken } from "../ids.js";
import type { Access, HeaderSource } from "../access.js";
import { PIN_RE, hashPin, type Pins } from "../pins.js";
import { VENUE_RETENTION_DAYS } from "./sheets.js";
import { newSheetId, type SheetPhotoStore, type SheetRecord, type SheetRepository } from "../sheets.js";
import { newVenueId, type VenueRecord, type VenueRepository } from "../venues.js";

const Pin = z.string().regex(PIN_RE, "A PIN is 4 to 8 digits.");

/**
 * Venues: one permanent code (the QR) and PIN per place, a few runners, and the sheets attached to it.
 * Before the PIN a visitor learns only the venue's name. The owner code can do everything a runner can, on every venue.
 */
export function venueRoutes(app: Hono, a: Access, venues: VenueRepository, sheets: SheetRepository, photos: SheetPhotoStore, pins: Pins) {
  const { now, ownerOnly } = a;

  /** The owner, or a person named as a runner of this venue. */
  const runs = async (c: HeaderSource, v: VenueRecord) => {
    const who = await a.access(c, false);
    return !!who && (who.owner || v.runnerIds.includes(who.id));
  };
  const saveVenue = (id: string) => async (p: { pinFails: number; pinLockedUntil?: string }) => {
    const cur = await venues.get(id);
    if (cur) await venues.put({ ...cur, ...p });
  };

  app.get("/api/venues/:id", async (c) => {
    const v = await venues.get(c.req.param("id"));
    if (!v) return c.json({ error: "not found" }, 404);
    const canManage = await runs(c, v);
    if (!canManage && !pins.valid(c, "v", v.id, v.pinVersion)) return c.json({ name: v.name, pinRequired: true });
    const list = await sheets.listByVenue(v.id);
    // Runners see every sheet with its stage (deleted ones too, marked, so they can undo). Viewers see published sheets, and a bare
    // "open for blocks" line for sheets that are posted or in draft: the game and the date, nothing else, and no way in.
    const stageOf = (r: SheetRecord) => (r.deletedAt ? "deleted" : r.posted ? "posted" : r.draft ? "draft" : "published");
    const venueSheets = canManage
      ? list.map((r) => ({
          id: r.id,
          stage: stageOf(r),
          title: r.title,
          teams: r.doc.teams,
          kickoff: r.doc.game.kickoff,
          ownPin: !!r.pinHash,
          ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}),
        }))
      : list
          .filter((r) => !r.deletedAt)
          .map((r) =>
            r.posted || r.draft
              ? { stage: "posted", title: r.title, teams: r.doc.teams, kickoff: r.doc.game.kickoff }
              : { id: r.id, stage: "published", title: r.title, teams: r.doc.teams, kickoff: r.doc.game.kickoff, ownPin: !!r.pinHash },
          );
    return c.json({
      name: v.name,
      canManage,
      sheets: venueSheets,
      ...(canManage ? { wrongTries: v.pinFails ?? 0, lockedUntil: v.pinLockedUntil } : {}),
    });
  });

  app.post("/api/venues/:id/enter", async (c) => {
    const v = await venues.get(c.req.param("id"));
    if (!v) return c.json({ error: "not found" }, 404);
    const { pin } = z.object({ pin: z.string().max(20) }).parse(await c.req.json());
    const r = await pins.attempt(c, "v", v.id, () => venues.get(v.id), pin, saveVenue(v.id));
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error, retryAfter: r.retryAfter }, r.status);
  });

  /** The venues this person runs (all of them for the owner), for finding their QR and tools. */
  app.get("/api/my/venues", async (c) => {
    const who = await a.access(c, false);
    if (!who) return c.json({ error: "access code required" }, 403);
    const list = who.owner ? await venues.list() : await venues.listByRunner(who.id);
    return c.json({ venues: list.map((v) => ({ id: v.id, name: v.name, ...(who.owner ? { runnerIds: v.runnerIds } : {}) })) });
  });

  app.post("/api/owner/venues", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const b = z
      .object({ name: z.string().trim().min(1).max(60), pin: Pin, runnerIds: z.array(z.string().max(40)).max(10).default([]) })
      .parse(await c.req.json());
    const v: VenueRecord = {
      id: newVenueId(),
      name: b.name,
      pinHash: hashPin(b.pin),
      pinVersion: 1,
      runnerIds: b.runnerIds,
      createdAt: now().toISOString(),
    };
    await venues.put(v);
    return c.json({ id: v.id, name: v.name, runnerIds: v.runnerIds }, 201);
  });

  /** Rename, change the PIN (signs everyone out), or (owner only) change who runs it. */
  app.patch("/api/venues/:id", async (c) => {
    const v = await venues.get(c.req.param("id"));
    if (!v) return c.json({ error: "not found" }, 404);
    if (!(await runs(c, v))) return c.json({ error: "you don't run this venue" }, 403);
    const b = z
      .object({ name: z.string().trim().min(1).max(60).optional(), pin: Pin.optional(), runnerIds: z.array(z.string().max(40)).max(10).optional() })
      .parse(await c.req.json());
    if (b.runnerIds && !(await ownerOnly(c))) return c.json({ error: "only the owner changes who runs a venue" }, 403);
    const next: VenueRecord = { ...v };
    if (b.name) next.name = b.name;
    if (b.runnerIds) next.runnerIds = b.runnerIds;
    if (b.pin) {
      next.pinHash = hashPin(b.pin);
      next.pinVersion = v.pinVersion + 1;
      next.pinFails = undefined;
      next.pinLockedUntil = undefined;
    }
    await venues.put(next);
    return c.json({ id: next.id, name: next.name });
  });

  /**
   * Post a pool: the game is picked and the teams are placed, and the pool is on the venue's wall as "open for blocks". It has no photo yet,
   * so no names and no digits; the runner adds the photo once the digits are drawn (see the photo route), and it becomes a draft.
   */
  app.post("/api/venues/:id/sheets", async (c) => {
    const v = await venues.get(c.req.param("id"));
    if (!v) return c.json({ error: "not found" }, 404);
    if (!(await runs(c, v))) return c.json({ error: "you don't run this venue" }, 403);
    const who = await a.access(c, false);
    const b = z
      .object({ teams: SheetDocSchema.shape.teams, game: SheetDocSchema.shape.game, title: z.string().trim().max(80).optional() })
      .parse(await c.req.json());
    const t = now().toISOString();
    const kickoff = Date.parse(b.game.kickoff);
    const rec: SheetRecord = {
      id: newSheetId(),
      editTokenHash: hashToken(newEditToken()), // never shown: runners edit with their keys, and can make an edit link from the sheet later
      // Placeholder grid, replaced when the photo is read; nothing is shown from it while the pool is posted.
      doc: SheetDocSchema.parse({
        width: 1,
        height: 1,
        corners: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        teams: b.teams,
        mode: "shared",
        rows: {},
        game: b.game,
        finalIncludesOvertime: true,
      }),
      hasPhoto: false,
      createdBy: who?.name,
      createdById: who?.id,
      updatedBy: who?.name,
      venueId: v.id,
      title: b.title || undefined,
      posted: true,
      createdAt: t,
      updatedAt: t,
      expiresAt: new Date(Math.max(Date.parse(t), Number.isFinite(kickoff) ? kickoff : 0) + VENUE_RETENTION_DAYS * 86_400_000).toISOString(),
    };
    await sheets.put(rec);
    return c.json({ id: rec.id }, 201);
  });

  /** Close a venue: its sheets and photos go with it, so nothing is left behind without a PIN. Owner only. */
  app.delete("/api/venues/:id", async (c) => {
    if (!(await ownerOnly(c))) return c.json({ error: "owner only" }, 403);
    const v = await venues.get(c.req.param("id"));
    if (!v) return c.json({ error: "not found" }, 404);
    for (const r of await sheets.listByVenue(v.id)) {
      await photos.delete(r.id);
      await sheets.delete(r.id);
    }
    await venues.delete(v.id);
    return c.body(null, 204);
  });
}
