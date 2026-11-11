import type { SheetDoc } from "@bpc/engine";
import { accessKey } from "./access";

export type Sheet = SheetDoc;
export type NameEntry = Sheet["names"][string];

export class SheetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The sheet is behind a PIN and this phone has no pass yet. Only the runner's title for it is known. */
export class PinRequired extends Error {
  constructor(readonly title: string) {
    super("PIN required");
  }
}

const json = async <T>(res: Response, what: string): Promise<T> => {
  if (!res.ok) throw new SheetError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? what, res.status);
  return res.json() as Promise<T>;
};
/** Edit proof: the edit link's token, and/or the personal key (which edits the sheets its owner made). */
export const auth = (token?: string): Record<string, string> => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(accessKey() ? { "X-Invite-Code": accessKey() } : {}),
});

export const photoUrl = (id: string) => `/api/sheets/${encodeURIComponent(id)}/photo`;

/** Save a new sheet and its photo. The returned edit token is shown once: it lives only in the link the person keeps. */
export async function createSheet(doc: Sheet, photo: Blob): Promise<{ id: string; editToken: string }> {
  const made = await json<{ id: string; editToken: string }>(
    await fetch("/api/sheets", { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(doc) }),
    "could not save the sheet",
  );
  const up = await fetch(`/api/sheets/${made.id}/photo`, { method: "PUT", headers: { "Content-Type": "image/jpeg", ...auth(made.editToken) }, body: photo });
  if (!up.ok) throw new SheetError("could not save the photo", up.status);
  return made;
}

/** What an editor can change besides the sheet itself. Viewers never receive it. */
export interface SheetSettings {
  venueId?: string;
  showPhoto: boolean;
  hasPin: boolean;
  /** On a venue, photo in, not published: only the people who run it can see it. */
  draft: boolean;
  /** On a venue's wall but with no photo yet. */
  posted: boolean;
}
export interface LoadedSheet {
  doc: Sheet;
  title?: string;
  hasPhoto: boolean;
  expiresAt: string;
  canEdit: boolean;
  createdBy?: string;
  createdAt?: string;
  settings?: SheetSettings;
  /** Present when the sheet was deleted: editors can still open it (read-only) to restore it; only the owner can erase it. */
  deleted?: { at: string; goneOn: string; canErase: boolean };
}

export async function loadSheet(id: string, token?: string): Promise<LoadedSheet> {
  const res = await fetch(`/api/sheets/${encodeURIComponent(id)}`, { headers: auth(token) }); // the edit token proves edit rights, so marked blocks come back too
  if (res.status === 401) {
    const b = (await res.json().catch(() => ({}))) as { pinRequired?: boolean; title?: string };
    if (b.pinRequired) throw new PinRequired(b.title ?? "");
  }
  return json(res, "could not open the sheet");
}

/** Try a PIN for a sheet (its own, else its venue's). A right one sets a pass cookie on this browser. Throws with the server's message. */
export async function enterSheet(id: string, pin: string): Promise<void> {
  const res = await fetch(`/api/sheets/${encodeURIComponent(id)}/enter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new SheetError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work.", res.status);
}

/** The photo as a local blob, fetched with the person's key or edit link (an <img> tag cannot send them). */
export async function photoBlob(id: string, token?: string): Promise<Blob> {
  const res = await fetch(photoUrl(id), { headers: auth(token) });
  if (!res.ok) throw new SheetError("no photo", res.status);
  return res.blob();
}

export interface SheetSettingsPatch {
  title?: string | null;
  showPhoto?: boolean;
  pin?: string | null;
  venueId?: string | null;
  boardId?: string;
  /** false = publish to the venue's viewers; true = take it back to a draft. */
  draft?: boolean;
}
export async function patchSettings(
  id: string,
  token: string,
  patch: SheetSettingsPatch,
): Promise<{ title?: string; settings: SheetSettings; expiresAt: string }> {
  return json(
    await fetch(`/api/sheets/${encodeURIComponent(id)}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify(patch),
    }),
    "could not save that",
  );
}

export interface SheetSummary {
  id: string;
  createdBy?: string;
  teams: { top: string; left: string };
  kickoff: string;
  label: string;
  title?: string;
  /** Set for a deleted sheet that can still be restored, with the day it goes for good. */
  deletedAt?: string;
  goneOn?: string;
  draft?: boolean;
  posted?: boolean;
  createdAt: string;
  updatedAt: string;
}
/** The sheets this person made (found through their personal key; nothing about them is kept in the browser). */
export async function mySheets(): Promise<SheetSummary[]> {
  return (await json<{ sheets: SheetSummary[] }>(await fetch("/api/my/sheets", { headers: auth() }), "could not list your sheets")).sheets;
}

export async function saveSheet(id: string, token: string, doc: Sheet): Promise<void> {
  await json(
    await fetch(`/api/sheets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify(doc),
    }),
    "could not save",
  );
}

export async function deleteSheet(id: string, token: string): Promise<void> {
  const res = await fetch(`/api/sheets/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth(token) });
  if (!res.ok) throw new SheetError("could not delete", res.status);
}

/** The edit token rides in the link's #fragment (`#k=...`), which browsers never send to a server. */
export const tokenFromHash = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("k") ?? "";

/** Make a new edit link for a sheet you made (the original token is never kept, so it cannot be shown again). */
export async function newEditToken(id: string): Promise<string> {
  return (
    await json<{ editToken: string }>(
      await fetch(`/api/sheets/${encodeURIComponent(id)}/edit-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: "{}",
      }),
      "could not make an edit link",
    )
  ).editToken;
}

/** Undo a delete (whoever could edit the sheet). */
export async function restoreSheet(id: string, token?: string): Promise<void> {
  const res = await fetch(`/api/sheets/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: "{}",
  });
  if (!res.ok) throw new SheetError("could not restore", res.status);
}

/** Owner only: delete a deleted sheet and its photo for good, now. */
export async function eraseSheet(id: string): Promise<void> {
  const res = await fetch(`/api/owner/sheets/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth() });
  if (!res.ok) throw new SheetError("could not delete", res.status);
}

/**
 * Put the photo into a sheet that was posted without one: the real grid replaces the placeholder, then the photo is stored, which
 * takes the sheet to draft. Needs the person's key (a posted sheet has no edit link).
 */
export async function fillSheet(id: string, doc: Sheet, photo: Blob): Promise<void> {
  await saveSheet(id, "", doc);
  const up = await fetch(`/api/sheets/${encodeURIComponent(id)}/photo`, { method: "PUT", headers: { "Content-Type": "image/jpeg", ...auth() }, body: photo });
  if (!up.ok) throw new SheetError("could not save the photo", up.status);
}
