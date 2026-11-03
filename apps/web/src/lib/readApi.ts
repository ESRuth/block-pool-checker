import type { DigitProblem, ReadResult } from "@bpc/engine";
import { accessKey, setAccessKey } from "./access";

export interface ReadResponse {
  read: ReadResult;
  /** null unless every row is a clean 0-9 permutation. */
  digits: unknown;
  problems: DigitProblem[];
  model: string;
}

export class ReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const inviteCode = () => accessKey();
export const setInviteCode = (c: string) => setAccessKey(c.trim());

export async function readPhoto(blob: Blob): Promise<ReadResponse> {
  const res = await fetch("/api/read", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", ...(inviteCode() ? { "X-Invite-Code": inviteCode() } : {}) },
    body: blob,
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "could not read the photo";
    throw new ReadError(msg, res.status);
  }
  return res.json();
}

/** Read all 100 names from ONE straightened image of the grid. Rows top to bottom, 10 names each; unreadable = null. */
export async function readNames(image: string): Promise<Array<Array<string | null>>> {
  const res = await fetch("/api/read-names", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(inviteCode() ? { "X-Invite-Code": inviteCode() } : {}) },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new ReadError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "could not read the names", res.status);
  return ((await res.json()) as { names: Array<Array<string | null>> }).names;
}
