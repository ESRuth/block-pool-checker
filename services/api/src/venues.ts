import { randomBytes } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import type { PinState } from "./pins.js";

/** A place that runs pools (a lodge, bar or club): one permanent code (the QR), one PIN, and the sheets attached to it. */
export interface VenueRecord extends PinState {
  /** The code in the QR. Unguessable (128 bits), but the PIN is what protects the sheets behind it. */
  id: string;
  name: string;
  pinHash: string;
  pinVersion: number;
  /** Personal-key holders who run it (a runner plus backups). The owner can always run every venue. */
  runnerIds: string[];
  createdAt: string;
}

export interface VenueRepository {
  get(id: string): Promise<VenueRecord | null>;
  put(v: VenueRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Every venue, oldest first (the owner's view). */
  list(): Promise<VenueRecord[]>;
  listByRunner(userId: string): Promise<VenueRecord[]>;
}

export class MemoryVenueRepository implements VenueRepository {
  private readonly m = new Map<string, VenueRecord>();
  async get(id: string) {
    return structuredClone(this.m.get(id) ?? null);
  }
  async put(v: VenueRecord) {
    this.m.set(v.id, structuredClone(v));
  }
  async delete(id: string) {
    this.m.delete(id);
  }
  async list() {
    return structuredClone([...this.m.values()]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async listByRunner(userId: string) {
    return (await this.list()).filter((v) => v.runnerIds.includes(userId));
  }
}

/** Collection `venues`, doc id = venue id. */
export class FirestoreVenueRepository implements VenueRepository {
  private readonly col;
  constructor(db: Firestore = new Firestore()) {
    this.col = db.collection("venues");
  }
  private from(id: string, d: FirebaseFirestore.DocumentData): VenueRecord {
    return {
      id,
      name: d.name,
      pinHash: d.pinHash,
      pinVersion: d.pinVersion ?? 1,
      pinFails: d.pinFails ?? undefined,
      pinLockedUntil: d.pinLockedUntil ?? undefined,
      runnerIds: d.runnerIds ?? [],
      createdAt: d.createdAt,
    };
  }
  async get(id: string) {
    const s = await this.col.doc(id).get();
    return s.exists ? this.from(id, s.data()!) : null;
  }
  async put(v: VenueRecord) {
    await this.col.doc(v.id).set({
      name: v.name,
      pinHash: v.pinHash,
      pinVersion: v.pinVersion,
      pinFails: v.pinFails ?? null,
      pinLockedUntil: v.pinLockedUntil ?? null,
      runnerIds: v.runnerIds,
      createdAt: v.createdAt,
    });
  }
  async delete(id: string) {
    await this.col.doc(id).delete();
  }
  async list() {
    return (await this.col.get()).docs.map((d) => this.from(d.id, d.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async listByRunner(userId: string) {
    return (await this.col.where("runnerIds", "array-contains", userId).get()).docs.map((d) => this.from(d.id, d.data()));
  }
}

export const newVenueId = () => randomBytes(16).toString("base64url");
