import { accessKey } from "./access";
import type { Sheet } from "./sheetApi";

export class VenueError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(accessKey() ? { "X-Invite-Code": accessKey() } : {}) });
async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string; issues?: Array<{ message: string }> };
    throw new VenueError(b.error === "invalid request" ? (b.issues?.[0]?.message ?? "Check what you typed.") : (b.error ?? "That didn't work."), res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Where a sheet is: posted (open for blocks, no photo yet), draft (photo in, being checked), published, or deleted. */
export type Stage = "posted" | "draft" | "published" | "deleted";
export interface VenueSheet {
  /** Viewers are not given an id for a sheet that is posted or in draft: they only see that it exists. */
  id?: string;
  stage: Stage;
  tag?: string;
  teams: { top: string; left: string };
  kickoff: string;
  ownPin?: boolean;
  deletedAt?: string;
}
/** Before the PIN only `name` and `pinRequired` are present. */
export interface VenueView {
  name: string;
  pinRequired?: boolean;
  canManage?: boolean;
  sheets?: VenueSheet[];
  wrongTries?: number;
  lockedUntil?: string;
}
export interface VenueSummary {
  id: string;
  name: string;
  runnerIds?: string[];
}

export const getVenue = (id: string) => call<VenueView>(`/api/venues/${encodeURIComponent(id)}`);
/** The venue's current PIN, for its runners and the owner. Null when it cannot be shown (set before PINs could be shown). */
export const getVenuePin = async (id: string) => (await call<{ pin: string | null }>(`/api/venues/${encodeURIComponent(id)}/pin`)).pin;
export const enterVenue = (id: string, pin: string) => call<{ ok: true }>(`/api/venues/${encodeURIComponent(id)}/enter`, "POST", { pin });
export const myVenues = async () => (await call<{ venues: VenueSummary[] }>("/api/my/venues")).venues;
export const createVenue = (v: { name: string; pin: string; runnerIds: string[] }) => call<VenueSummary>("/api/owner/venues", "POST", v);
export const patchVenue = (id: string, p: { name?: string; pin?: string; runnerIds?: string[] }) =>
  call<VenueSummary>(`/api/venues/${encodeURIComponent(id)}`, "PATCH", p);
/** Post a sheet on the venue's wall: the game and the teams' places. Its photo comes later. */
export const postSheet = (id: string, b: { teams: { top: string; left: string }; game: Sheet["game"]; tag?: string }) =>
  call<{ id: string }>(`/api/venues/${encodeURIComponent(id)}/sheets`, "POST", b);
export const deleteVenue = (id: string) => call<void>(`/api/venues/${encodeURIComponent(id)}`, "DELETE");
export const venueLink = (id: string) => `${location.origin}/v/${id}`;
