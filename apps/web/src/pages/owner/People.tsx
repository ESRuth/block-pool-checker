import { useEffect, useState } from "react";
import { deletePerson, invitePerson, listPeople, newPersonLink, renamePerson, revokePerson, shareLink, type Person } from "../../lib/ownerApi";
import { myVenues, type VenueSummary } from "../../lib/venueApi";

/** "3 days ago" for a time, in the coarsest unit that fits. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 120) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

interface ShownLink {
  link: string;
  /** What this link means for the ones already out there. */
  replaced: boolean;
  fresh: boolean;
}

/** Owner only: invite people, and for each one: their link, what they run, when they last used it, and what you can do. */
export function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [name, setName] = useState("");
  const [links, setLinks] = useState<Record<string, ShownLink>>({});
  const [note, setNote] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = () =>
    listPeople()
      .then(setPeople)
      .catch(() => setNote("Could not load the list. Try again."));
  useEffect(() => {
    void load();
    myVenues()
      .then(setVenues)
      .catch(() => undefined);
  }, []);

  const fail = (e: unknown) => setNote(e instanceof Error ? e.message : "That didn't work.");
  const active = (people ?? []).filter((p) => !p.revoked).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const off = (people ?? []).filter((p) => p.revoked);
  const runs = (p: Person) => venues.filter((v) => v.runnerIds?.includes(p.id)).map((v) => v.name);

  async function invite() {
    try {
      const m = await invitePerson(name.trim());
      setLinks((l) => ({ ...l, [m.id]: { link: m.link, replaced: false, fresh: true } }));
      setName("");
      setNote("");
      await load();
      document.getElementById(`person-${m.id}`)?.scrollIntoView({ block: "nearest" });
    } catch (e) {
      fail(e);
    }
  }
  async function another(p: Person, replace: boolean) {
    if (replace && !confirm(`Replace ${p.name}'s link? Every link they have now stops working, so send them the new one.`)) return;
    try {
      const m = await newPersonLink(p, replace);
      setLinks((l) => ({ ...l, [p.id]: { link: m.link, replaced: replace, fresh: false } }));
      setNote("");
    } catch (e) {
      fail(e);
    }
  }
  async function turnOff(p: Person) {
    const where = runs(p);
    const warn = where.length ? ` They run ${where.join(" and ")}; someone else will need to.` : "";
    if (!confirm(`Turn off ${p.name} for good? All their links stop working and it cannot be undone.${warn}`)) return;
    await revokePerson(p);
    setLinks(({ [p.id]: _gone, ...rest }) => rest);
    void load();
  }

  async function remove(p: Person) {
    if (!confirm(`Delete ${p.name}'s record? Their name and use counts are removed and it cannot be undone. "Added by" on their sheets keeps the name.`))
      return;
    try {
      await deletePerson(p);
      setNote("");
      await load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <main className="steps">
      <header className="top">
        <h1>People</h1>
      </header>
      <section>
        <h2>Invite someone</h2>
        <p className="sub">A personal link signs one person's phone in. Make one for each runner and send it only to them.</p>
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void invite();
          }}
        >
          <input aria-label="Their name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan" maxLength={40} autoComplete="off" />
          <button className="primary" disabled={!name.trim()}>
            Make their link
          </button>
        </form>
        {note && (
          <p className="warn" role="alert">
            {note}
          </p>
        )}
      </section>

      <section>
        <h2>Who has a link{people ? ` (${active.length})` : ""}</h2>
        {people === null && (
          <p className="msg" role="status">
            Loading…
          </p>
        )}
        {people && active.length === 0 && <p className="sub">Nobody yet. Invite someone above.</p>}
        {active.map((u) => {
          const shown = links[u.id];
          const where = runs(u);
          return (
            <div key={u.id} id={`person-${u.id}`} className="person person-card">
              <div className="grow">
                {renaming?.id === u.id ? (
                  <form
                    className="actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renamePerson(u, renaming.name.trim())
                        .then(() => {
                          setRenaming(null);
                          setNote("");
                          return load();
                        })
                        .catch(fail);
                    }}
                  >
                    <input
                      aria-label={`New name for ${u.name}`}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: u.id, name: e.target.value })}
                      maxLength={40}
                      autoComplete="off"
                    />
                    <button className="primary" disabled={!renaming.name.trim() || renaming.name.trim() === u.name}>
                      Save
                    </button>
                    <button type="button" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <b>
                    {u.name}{" "}
                    <button className="linkbtn" onClick={() => setRenaming({ id: u.id, name: u.name })}>
                      Rename
                    </button>
                  </b>
                )}
                <div className="sub">{where.length ? `Runs ${where.join(", ")}` : "Not a runner yet (add them to a venue in the Venues tab)"}</div>
                <div className="sub">
                  {u.lastUsedAt ? `Last used ${ago(u.lastUsedAt)} · ${u.uses} ${u.uses === 1 ? "use" : "uses"}` : "Hasn't opened their link yet"}
                </div>
                {shown && (
                  <div className="linkbox">
                    <p>
                      <b>{shown.fresh ? "Their link" : shown.replaced ? "Their new link" : "Another link for them"}</b>
                    </p>
                    <input readOnly value={shown.link} onFocus={(e) => e.currentTarget.select()} aria-label={`${u.name}'s link`} />
                    <div className="actions">
                      <button onClick={() => shareLink(shown.link, u.name).then((n) => n && setNote(n))}>Send or copy</button>
                    </div>
                    <p className="sub">
                      Anyone with this link is signed in as {u.name}.{" "}
                      {shown.replaced
                        ? "Their older links no longer work."
                        : shown.fresh
                          ? "It is shown now and cannot be shown again, but you can always make another."
                          : "Their older links still work until you replace them or turn them off."}
                    </p>
                  </div>
                )}
              </div>
              <div className="actions">
                <button onClick={() => another(u, false)} title="Makes another link. The links they already have keep working.">
                  Another link
                </button>
                <button onClick={() => another(u, true)} title="Makes a new link and stops every older one working.">
                  Replace link
                </button>
                <button className="danger-btn" onClick={() => turnOff(u)}>
                  Turn off
                </button>
              </div>
            </div>
          );
        })}
        {off.length > 0 && (
          <details>
            <summary>Turned off ({off.length})</summary>
            {off.map((u) => (
              <div key={u.id} className="person off">
                <b>{u.name}</b>
                <div className="sub">Their links no longer work.</div>
                <div className="actions">
                  <button className="danger-btn" onClick={() => remove(u)}>
                    Delete record
                  </button>
                </div>
              </div>
            ))}
          </details>
        )}
      </section>
    </main>
  );
}
