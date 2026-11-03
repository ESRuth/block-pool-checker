import { randomBytes } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { hashToken } from "./ids.js";

/** A person the owner has invited. Their personal key lets them read photos and create sheets; revoking it stops that at once. */
export interface UserRecord {
  id: string;
  name: string;
  /** Only the hash is stored; the key is shown once, inside the personal link. */
  keyHash: string;
  /** Hashes of links the owner made later ("Get a link"); the person's older links keep working. */
  extraKeyHashes?: string[];
  createdAt: string;
  lastUsedAt?: string;
  /** Count of photo reads / sheet creations done with this key (cost tracking). */
  uses: number;
  revoked: boolean;
  /** Model reads made on `readDay` (UTC date); the daily cap resets when the day changes. */
  readDay?: string;
  readsToday?: number;
}

export interface UserRepository {
  byKeyHash(hash: string): Promise<UserRecord | null>;
  get(id: string): Promise<UserRecord | null>;
  put(u: UserRecord): Promise<void>;
  list(): Promise<UserRecord[]>;
}

export class MemoryUserRepository implements UserRepository {
  private readonly m = new Map<string, UserRecord>();
  async byKeyHash(hash: string) {
    return structuredClone([...this.m.values()].find((u) => u.keyHash === hash || (u.extraKeyHashes ?? []).includes(hash)) ?? null);
  }
  async get(id: string) {
    return structuredClone(this.m.get(id) ?? null);
  }
  async put(u: UserRecord) {
    this.m.set(u.id, structuredClone(u));
  }
  async list() {
    return structuredClone([...this.m.values()]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

/** Collection `users`, doc id = user id. */
export class FirestoreUserRepository implements UserRepository {
  private readonly col;
  constructor(db: Firestore = new Firestore()) {
    this.col = db.collection("users");
  }
  private from(id: string, d: FirebaseFirestore.DocumentData): UserRecord {
    return {
      id,
      name: d.name,
      keyHash: d.keyHash,
      extraKeyHashes: d.extraKeyHashes ?? undefined,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt ?? undefined,
      uses: d.uses ?? 0,
      revoked: !!d.revoked,
      readDay: d.readDay ?? undefined,
      readsToday: d.readsToday ?? undefined,
    };
  }
  async byKeyHash(hash: string) {
    const first =
      (await this.col.where("keyHash", "==", hash).limit(1).get()).docs[0] ??
      (await this.col.where("extraKeyHashes", "array-contains", hash).limit(1).get()).docs[0];
    return first ? this.from(first.id, first.data()) : null;
  }
  async get(id: string) {
    const s = await this.col.doc(id).get();
    return s.exists ? this.from(id, s.data()!) : null;
  }
  async put(u: UserRecord) {
    await this.col.doc(u.id).set({
      name: u.name,
      keyHash: u.keyHash,
      extraKeyHashes: u.extraKeyHashes ?? [],
      createdAt: u.createdAt,
      lastUsedAt: u.lastUsedAt ?? null,
      uses: u.uses,
      revoked: u.revoked,
      readDay: u.readDay ?? null,
      readsToday: u.readsToday ?? null,
    });
  }
  async list() {
    return (await this.col.get()).docs.map((d) => this.from(d.id, d.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export const newUserId = () => randomBytes(8).toString("base64url");
export const newUserKey = () => randomBytes(15).toString("base64url");
export { hashToken };
