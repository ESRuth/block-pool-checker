import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Unguessable pool id (128 bits). Anyone holding it can view the pool. */
export const newPoolId = () => randomBytes(16).toString("base64url");
/** Secret needed to edit/delete; only its hash is stored. */
export const newEditToken = () => randomBytes(24).toString("base64url");

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
