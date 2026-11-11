import { randomBytes } from "node:crypto";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { SheetDocSchema, type SheetDoc } from "@bpc/engine";
import type { PinState } from "./pins.js";

export interface SheetRecord extends PinState {
  id: string;
  doc: SheetDoc;
  hasPhoto: boolean;
  /** Who made it / last changed it, by the name the owner gave them. Absent when no personal key was used. */
  createdBy?: string;
  /** Id of the person who made it (owner for the owner code); that person can always edit it. */
  createdById?: string;
  updatedBy?: string;
  /** The venue this sheet is on. Its PIN protects the sheet unless the sheet has its own (`pinHash`). Every sheet has one; a record without it is an older standalone sheet that only its maker and the owner can open. */
  venueId?: string;
  /** A short label the runner adds when starting a sheet ("$10"), to tell two pools for one game apart. Everything else shown about a sheet (the teams, the day) comes from its game. */
  tag?: string;
  /** Whether people with the PIN also get the photo. Photos show handwriting and phone numbers, so viewers do not get it by default. */
  showPhoto?: boolean;
  /** Posted: the pool is on the venue's wall (game chosen, teams placed) but its photo is not in yet, so there are no names or digits. Viewers see it as "open for blocks". */
  posted?: boolean;
  /** Draft: the photo is in and the pool is on a venue, but a runner has not published it. Only the people who run it see it. */
  draft?: boolean;
  /** Set when a runner deleted it: hidden from every list and link, but kept for the owner to restore until `expiresAt` removes it for good. */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Sheet and photo are deleted after this. */
  expiresAt: string;
}

/** Storage seam: Firestore in production, memory in tests/dev. Implementations must not return expired records. */
export const OWNER_ID = "owner";
/** Sheets saved before creators were recorded belong to the owner (the only person who could make them). */
const ownedBy = (r: SheetRecord, id: string) => r.createdById === id || (id === OWNER_ID && !r.createdById);

export interface SheetRepository {
  get(id: string): Promise<SheetRecord | null>;
  put(rec: SheetRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Live sheets made by this person, newest first. */
  listByCreator(createdById: string): Promise<SheetRecord[]>;
  /** Every live sheet, newest first (the owner's view). */
  listAll(): Promise<SheetRecord[]>;
  /** Live sheets attached to a venue, soonest game first. */
  listByVenue(venueId: string): Promise<SheetRecord[]>;
}

export class MemorySheetRepository implements SheetRepository {
  private readonly m = new Map<string, SheetRecord>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  async get(id: string) {
    const r = this.m.get(id);
    if (!r) return null;
    if (Date.parse(r.expiresAt) <= this.now().getTime()) {
      this.m.delete(id);
      return null;
    }
    return structuredClone(r);
  }
  async put(rec: SheetRecord) {
    this.m.set(rec.id, structuredClone(rec));
  }
  async delete(id: string) {
    this.m.delete(id);
  }
  async listAll() {
    const t = this.now().getTime();
    return [...this.m.values()]
      .filter((r) => Date.parse(r.expiresAt) > t)
      .map((r) => structuredClone(r))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listByVenue(venueId: string) {
    return (await this.listAll()).filter((r) => r.venueId === venueId).sort((a, b) => a.doc.game.kickoff.localeCompare(b.doc.game.kickoff));
  }
  async listByCreator(createdById: string) {
    const t = this.now().getTime();
    return [...this.m.values()]
      .filter((r) => ownedBy(r, createdById) && Date.parse(r.expiresAt) > t)
      .map((r) => structuredClone(r))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Collection `sheets`, doc id = sheet id. Add a Firestore TTL policy on `expiresAt`; `get` also ignores expired docs because TTL deletion can lag. */
export class FirestoreSheetRepository implements SheetRepository {
  private readonly col;
  constructor(
    db: Firestore = new Firestore(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.col = db.collection("sheets");
  }
  async get(id: string): Promise<SheetRecord | null> {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) return null;
    const r = this.fromData(id, snap.data()!);
    return Date.parse(r.expiresAt) <= this.now().getTime() ? null : r;
  }
  private fromData(id: string, d: FirebaseFirestore.DocumentData): SheetRecord {
    const expiresAt = (d.expiresAt as Timestamp).toDate();
    return {
      id,
      doc: SheetDocSchema.parse(d.doc),
      hasPhoto: !!d.hasPhoto,
      createdBy: d.createdBy ?? undefined,
      createdById: d.createdById ?? undefined,
      updatedBy: d.updatedBy ?? undefined,
      venueId: d.venueId ?? undefined,
      tag: d.tag ?? undefined,
      showPhoto: d.showPhoto ?? undefined,
      deletedAt: d.deletedAt ?? undefined,
      draft: d.draft ?? undefined,
      posted: d.posted ?? undefined,
      pinHash: d.pinHash ?? undefined,
      pinSealed: d.pinSealed ?? undefined,
      pinVersion: d.pinVersion ?? undefined,
      pinFails: d.pinFails ?? undefined,
      pinLockedUntil: d.pinLockedUntil ?? undefined,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async put(rec: SheetRecord) {
    await this.col.doc(rec.id).set({
      doc: JSON.parse(JSON.stringify(rec.doc)),
      hasPhoto: rec.hasPhoto,
      createdBy: rec.createdBy ?? null,
      createdById: rec.createdById ?? null,
      updatedBy: rec.updatedBy ?? null,
      venueId: rec.venueId ?? null,
      tag: rec.tag ?? null,
      showPhoto: rec.showPhoto ?? null,
      deletedAt: rec.deletedAt ?? null,
      draft: rec.draft ?? null,
      posted: rec.posted ?? null,
      pinHash: rec.pinHash ?? null,
      pinSealed: rec.pinSealed ?? null,
      pinVersion: rec.pinVersion ?? null,
      pinFails: rec.pinFails ?? null,
      pinLockedUntil: rec.pinLockedUntil ?? null,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      expiresAt: Timestamp.fromDate(new Date(rec.expiresAt)),
    });
  }
  async delete(id: string) {
    await this.col.doc(id).delete();
  }
  async listAll() {
    const t = this.now().getTime();
    return (await this.col.get()).docs
      .map((d) => this.fromData(d.id, d.data()))
      .filter((r) => Date.parse(r.expiresAt) > t)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listByVenue(venueId: string) {
    const t = this.now().getTime();
    return (await this.col.where("venueId", "==", venueId).get()).docs
      .map((d) => this.fromData(d.id, d.data()))
      .filter((r) => Date.parse(r.expiresAt) > t)
      .sort((a, b) => a.doc.game.kickoff.localeCompare(b.doc.game.kickoff));
  }
  async listByCreator(createdById: string) {
    // The owner also gets sheets made before sheets recorded who made them, which a field query cannot find: scan (the collection is small and short-lived).
    const q = createdById === OWNER_ID ? await this.col.get() : await this.col.where("createdById", "==", createdById).get();
    const t = this.now().getTime();
    return q.docs
      .map((d) => this.fromData(d.id, d.data()))
      .filter((r) => ownedBy(r, createdById) && Date.parse(r.expiresAt) > t)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Photo bytes, private. They show handwritten names and phone numbers: only ever served by the API, never logged, never public. */
export interface SheetPhotoStore {
  /** `expiresAt` is the sheet's removal date: the store stamps the photo with it so the photo goes when the sheet does. */
  put(id: string, bytes: Uint8Array, expiresAt?: string): Promise<void>;
  /** Move a photo's removal date (the sheet's date changed). A sheet with no photo yet is not an error. */
  setExpiry(id: string, expiresAt: string): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
}

export class MemorySheetPhotos implements SheetPhotoStore {
  private readonly m = new Map<string, Uint8Array>();
  /** Removal date stamped on each photo (read by tests). */
  readonly expiry = new Map<string, string>();
  async put(id: string, bytes: Uint8Array, expiresAt?: string) {
    this.m.set(id, bytes);
    if (expiresAt) this.expiry.set(id, expiresAt);
  }
  async setExpiry(id: string, expiresAt: string) {
    if (this.m.has(id)) this.expiry.set(id, expiresAt);
  }
  async get(id: string) {
    return this.m.get(id) ?? null;
  }
  async delete(id: string) {
    this.m.delete(id);
    this.expiry.delete(id);
  }
}

export class GcsSheetPhotos implements SheetPhotoStore {
  private readonly bucket;
  constructor(bucketName: string, storage: Storage = new Storage()) {
    this.bucket = storage.bucket(bucketName);
  }
  private file(id: string) {
    return this.bucket.file(`sheets/${id}.jpg`);
  }
  /** The bucket's lifecycle rule deletes an object once its custom time (here: the sheet's removal date) has passed; the 60-day age rule is the backstop. */
  async put(id: string, bytes: Uint8Array, expiresAt?: string) {
    await this.file(id).save(Buffer.from(bytes), {
      resumable: false,
      metadata: { contentType: "image/jpeg", ...(expiresAt ? { customTime: new Date(expiresAt).toISOString() } : {}) },
    });
  }
  async setExpiry(id: string, expiresAt: string) {
    try {
      await this.file(id).setMetadata({ customTime: new Date(expiresAt).toISOString() });
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
    }
  }
  async get(id: string) {
    try {
      const [buf] = await this.file(id).download();
      return new Uint8Array(buf);
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  }
  async delete(id: string) {
    await this.file(id).delete({ ignoreNotFound: true });
  }
}

export const newSheetId = () => randomBytes(16).toString("base64url");
