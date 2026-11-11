import { useEffect, useState } from "react";
import { accessKey, setAccessKey } from "../lib/access";
import { createVenue, deleteVenue, myVenues, patchVenue, venueLink, type VenueSummary } from "../lib/venueApi";

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
export function Owner() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [denied, setDenied] = useState(!accessKey());
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ name: string; link: string } | null>(null);
  const [note, setNote] = useState("");
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [vName, setVName] = useState("");
  const [vPin, setVPin] = useState("");
  const [vRunners, setVRunners] = useState<string[]>([]);

  const loadVenues = () =>
    myVenues()
      .then(setVenues)
      .catch(() => undefined);
  async function addVenue() {
    try {
      const v = await createVenue({ name: vName.trim(), pin: vPin, runnerIds: vRunners });
      setNote(`Made ${v.name}. Open it to print its QR code: ${venueLink(v.id)}`);
      setVName("");
      setVPin("");
      setVRunners([]);
      loadVenues();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the venue.");
    }
  }
  async function closeVenue(v: VenueSummary) {
    if (!confirm(`Close ${v.name}? Its QR code stops working and every sheet on it is deleted now.`)) return;
    await deleteVenue(v.id).catch(() => undefined);
    loadVenues();
  }
  async function setRunners(v: VenueSummary, runnerIds: string[]) {
    await patchVenue(v.id, { runnerIds }).catch(() => undefined);
    loadVenues();
  }

  const load = async () => {
    const res = await fetch("/api/owner/users", { headers: headers() }).catch(() => null);
    if (res?.ok) {
      setUsers(((await res.json()) as { users: User[] }).users);
      setDenied(false);
      loadVenues();
    } else setDenied(true);
  };
  useEffect(() => {
    if (accessKey()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const res = await fetch("/api/owner/users", { method: "POST", headers: headers(), body: JSON.stringify({ name }) });
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
    const res = await fetch(`/api/owner/users/${u.id}/links`, { method: "POST", headers: headers(), body: "{}" });
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
    await fetch(`/api/owner/users/${u.id}/revoke`, { method: "POST", headers: headers(), body: "{}" });
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
      /* canblocked */
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
        <h1>Owner</h1>
      </header>
      <section>
        <h2>Invite someone</h2>
        <div>
          <label className="field">
            Their name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan" autoComplete="off" />
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
        <h2>Venues</h2>
        <p className="sub">
          A venue is a place that runs pools, with one QR code and PIN that never change. Its runners (a main one and backups) post each week's pools, add their
          photos. You can do anything a runner can.
        </p>
        <label className="field">
          Venue name
          <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="e.g. Main Street Lodge" maxLength={60} />
        </label>
        <label className="field">
          PIN (4 to 8 digits)
          <input value={vPin} onChange={(e) => setVPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} autoComplete="off" />
        </label>
        <fieldset>
          <legend>Runners</legend>
          {users
            ?.filter((u) => !u.revoked)
            .map((u) => (
              <label key={u.id} className="check">
                <input
                  type="checkbox"
                  checked={vRunners.includes(u.id)}
                  onChange={(e) => setVRunners(e.target.checked ? [...vRunners, u.id] : vRunners.filter((x) => x !== u.id))}
                />
                {u.name}
              </label>
            ))}
          {users?.length === 0 && <p className="sub">Invite someone above first.</p>}
        </fieldset>
        <button className="primary" disabled={!vName.trim() || vPin.length < 4} onClick={addVenue}>
          Make the venue
        </button>
        {venues.map((v) => (
          <div key={v.id} className="person">
            <div>
              <b>{v.name}</b>
              <div className="sub">
                Runners:{" "}
                {users
                  ?.filter((u) => !u.revoked)
                  .map((u) => (
                    <label key={u.id} className="check">
                      <input
                        type="checkbox"
                        checked={v.runnerIds?.includes(u.id) ?? false}
                        onChange={(e) => setRunners(v, e.target.checked ? [...(v.runnerIds ?? []), u.id] : (v.runnerIds ?? []).filter((x) => x !== u.id))}
                      />
                      {u.name}
                    </label>
                  ))}
              </div>
            </div>
            <div className="actions">
              <a className="bigbtn" href={`/v/${v.id}`}>
                Open
              </a>
              <button onClick={() => closeVenue(v)}>Close</button>
            </div>
          </div>
        ))}
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
