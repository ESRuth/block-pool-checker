import { randomBytes } from "node:crypto";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { SheetDocSchema, type SheetDoc } from "@bpc/engine";

export interface SheetRecord {
  id: string;
  editTokenHash: string;
  /** Hashes of edit links made later from the sheet page (the creator can make more at any time). */
  extraEditTokenHashes?: string[];
  doc: SheetDoc;
  hasPhoto: boolean;
  /** Who made it / last changed it, by the name the owner gave them. Absent when no personal key was used. */
  createdBy?: string;
  /** Id of the person who made it (owner for the owner code); that person can always edit it without the edit link. */
  createdById?: string;
  updatedBy?: string;
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
      editTokenHash: d.editTokenHash,
      extraEditTokenHashes: d.extraEditTokenHashes ?? undefined,
      doc: SheetDocSchema.parse(d.doc),
      hasPhoto: !!d.hasPhoto,
      createdBy: d.createdBy ?? undefined,
      createdById: d.createdById ?? undefined,
      updatedBy: d.updatedBy ?? undefined,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async put(rec: SheetRecord) {
    await this.col.doc(rec.id).set({
      editTokenHash: rec.editTokenHash,
      extraEditTokenHashes: rec.extraEditTokenHashes ?? [],
      doc: JSON.parse(JSON.stringify(rec.doc)),
      hasPhoto: rec.hasPhoto,
      createdBy: rec.createdBy ?? null,
      createdById: rec.createdById ?? null,
      updatedBy: rec.updatedBy ?? null,
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
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
}

export class MemorySheetPhotos implements SheetPhotoStore {
  private readonly m = new Map<string, Uint8Array>();
  async put(id: string, bytes: Uint8Array) {
    this.m.set(id, bytes);
  }
  async get(id: string) {
    return this.m.get(id) ?? null;
  }
  async delete(id: string) {
    this.m.delete(id);
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
  async put(id: string, bytes: Uint8Array) {
    await this.file(id).save(Buffer.from(bytes), { contentType: "image/jpeg", resumable: false });
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
