import { createHash, timingSafeEqual } from "node:crypto";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
