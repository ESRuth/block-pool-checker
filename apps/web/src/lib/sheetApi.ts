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

const json = async <T>(res: Response, what: string): Promise<T> => {
  if (!res.ok) throw new SheetError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? what, res.status);
  return res.json() as Promise<T>;
};
/** Edit proof: the edit link's token, and/or the personal key (which edits the sheets its owner made). */
const auth = (token?: string): Record<string, string> => ({
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

export async function loadSheet(
  id: string,
  token?: string,
): Promise<{ doc: Sheet; hasPhoto: boolean; expiresAt: string; canEdit: boolean; createdBy?: string; createdAt?: string }> {
  return json(await fetch(`/api/sheets/${encodeURIComponent(id)}`, { headers: auth(token) }), "could not open the sheet"); // the edit token proves edit rights, so marked squares come back too
}

export interface SheetSummary {
  id: string;
  createdBy?: string;
  teams: { top: string; left: string };
  kickoff: string;
  label: string;
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
