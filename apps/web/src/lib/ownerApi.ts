import { auth } from "./sheetApi";

export interface Person {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  uses: number;
  revoked: boolean;
}

const headers = () => ({ "Content-Type": "application/json", ...auth() });

/** Everyone the owner has made a personal link for. */
export async function listPeople(): Promise<Person[]> {
  const res = await fetch("/api/owner/users", { headers: headers() });
  if (!res.ok) throw new Error("could not list people");
  return ((await res.json()) as { users: Person[] }).users;
}
/** Make someone a personal link. The key is shown once, inside the link. */
export async function invitePerson(name: string): Promise<{ name: string; link: string }> {
  const res = await fetch("/api/owner/users", { method: "POST", headers: headers(), body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error("Could not make the link.");
  const u = (await res.json()) as Person & { key: string };
  return { name: u.name, link: `${location.origin}/join#c=${u.key}` };
}
export async function newPersonLink(p: Person): Promise<{ name: string; link: string }> {
  const res = await fetch(`/api/owner/users/${p.id}/links`, { method: "POST", headers: headers(), body: "{}" });
  if (!res.ok) throw new Error("Could not make a link.");
  return { name: p.name, link: `${location.origin}/join#c=${((await res.json()) as { key: string }).key}` };
}
export async function revokePerson(p: Person): Promise<void> {
  await fetch(`/api/owner/users/${p.id}/revoke`, { method: "POST", headers: headers(), body: "{}" });
}
/** Hand the link to the phone's share sheet, or copy it. Returns what happened, for a note. */
export async function shareLink(link: string, who: string): Promise<string> {
  try {
    if (navigator.share) {
      await navigator.share({ url: link, title: "Block Pool Checker", text: `${who}, open this on your phone:` });
      return "";
    }
    await navigator.clipboard.writeText(link);
    return "Link copied.";
  } catch {
    return ""; // the person closed the share sheet
  }
}
