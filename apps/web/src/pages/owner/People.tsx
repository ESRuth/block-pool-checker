import { useEffect, useState } from "react";
import { invitePerson, listPeople, newPersonLink, revokePerson, shareLink, type Person } from "../../lib/ownerApi";

/** Owner only: make a personal link for someone, see who has used it, make another, turn one off. */
export function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ name: string; link: string } | null>(null);
  const [note, setNote] = useState("");
  const load = () =>
    listPeople()
      .then(setPeople)
      .catch(() => setNote("Could not load the list. Try again."));
  useEffect(() => {
    void load();
  }, []);

  const fail = (e: unknown) => setNote(e instanceof Error ? e.message : "That didn't work.");
  return (
    <main className="steps">
      <header className="top">
        <h1>People</h1>
      </header>
      <section>
        <h2>Invite someone</h2>
        <label className="field">
          Their name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan" autoComplete="off" />
        </label>
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() =>
            invitePerson(name.trim())
              .then((m) => {
                setMade(m);
                setName("");
                setNote("");
                return load();
              })
              .catch(fail)
          }
        >
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
            <button onClick={() => shareLink(made.link, made.name).then(setNote)}>Send or copy</button>
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
        {people && people.length === 0 && <p className="sub">Nobody yet.</p>}
        {people?.map((u) => (
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
                <button
                  onClick={() =>
                    newPersonLink(u)
                      .then((m) => {
                        setMade(m);
                        setNote("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      })
                      .catch(fail)
                  }
                >
                  Get a link
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Turn off ${u.name}'s link? Their phone stops working until you make a new one.`)) revokePerson(u).then(load);
                  }}
                >
                  Turn off
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
