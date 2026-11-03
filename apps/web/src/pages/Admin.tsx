import { useEffect, useState } from "react";
import { accessKey, setAccessKey } from "../lib/access";

interface User {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  uses: number;
  revoked: boolean;
}

const headers = () => ({ "Content-Type": "application/json", "X-Invite-Code": accessKey() });

/** Owner only: make a personal link for someone, see who has used it, turn one off. */
export function Admin() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [denied, setDenied] = useState(!accessKey());
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ name: string; link: string } | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    const res = await fetch("/api/admin/users", { headers: headers() }).catch(() => null);
    if (res?.ok) {
      setUsers(((await res.json()) as { users: User[] }).users);
      setDenied(false);
    } else setDenied(true);
  };
  useEffect(() => {
    if (accessKey()) load();
  }, []);

  async function add() {
    const res = await fetch("/api/admin/users", { method: "POST", headers: headers(), body: JSON.stringify({ name }) });
    if (!res.ok) {
      setNote("Could not make the link.");
      return;
    }
    const u = (await res.json()) as User & { key: string };
    setMade({ name: u.name, link: `${location.origin}/join#c=${u.key}` });
    setName("");
    load();
  }
  async function again(u: User) {
    const res = await fetch(`/api/admin/users/${u.id}/links`, { method: "POST", headers: headers(), body: "{}" });
    if (!res.ok) {
      setNote("Could not make a link.");
      return;
    }
    const k = ((await res.json()) as { key: string }).key;
    setMade({ name: u.name, link: `${location.origin}/join#c=${k}` });
    setNote("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function revoke(u: User) {
    if (!confirm(`Turn off ${u.name}'s link? Their phone stops working until you make a new one.`)) return;
    await fetch(`/api/admin/users/${u.id}/revoke`, { method: "POST", headers: headers(), body: "{}" });
    load();
  }
  async function share(link: string, who: string) {
    try {
      if (navigator.share) await navigator.share({ url: link, title: "Block Pool Checker", text: `${who}, open this on your phone:` });
      else {
        await navigator.clipboard.writeText(link);
        setNote("Link copied.");
      }
    } catch {
      /* cancelled */
    }
  }

  if (denied) {
    return (
      <main className="steps">
        <header className="top">
          <h1>Owner</h1>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAccessKey(code);
            load();
          }}
        >
          <label>
            Owner code
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </label>
          <button className="primary" disabled={!code}>
            Open
          </button>
        </form>
      </main>
    );
  }
  return (
    <main className="steps">
      <header className="top">
        <a href="/" className="back" aria-label="Home">
          ‹
        </a>
        <h1>People</h1>
      </header>
      <section>
        <h2>Invite someone</h2>
        <div>
          <label className="field">
            Their name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skyes" autoComplete="off" />
          </label>
        </div>
        <button className="primary" disabled={!name.trim()} onClick={add}>
          Make their link
        </button>
        {made && (
          <div className="card">
            <p>
              <b>{made.name}'s link</b>
            </p>
            <p className="sub" style={{ wordBreak: "break-all" }}>
              {made.link}
            </p>
            <button onClick={() => share(made.link, made.name)}>Send or copy</button>
          </div>
        )}
        {note && (
          <p className="sub" role="status">
            {note}
          </p>
        )}
      </section>
      <section>
        <h2>Who has a link</h2>
        {users && users.length === 0 && <p className="sub">Nobody yet.</p>}
        {users?.map((u) => (
          <div key={u.id} className={u.revoked ? "person off" : "person"}>
            <div>
              <b>{u.name}</b>
              {u.revoked ? " · turned off" : ""}
              <div className="sub">
                {u.uses} {u.uses === 1 ? "use" : "uses"} · {u.lastUsedAt ? `last used ${new Date(u.lastUsedAt).toLocaleString()}` : "not used yet"}
              </div>
            </div>
            {!u.revoked && (
              <div className="actions">
                <button onClick={() => again(u)}>Get a link</button>
                <button onClick={() => revoke(u)}>Turn off</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
