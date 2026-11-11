import { useEffect, useState } from "react";
import { listPeople, type Person } from "../../lib/ownerApi";
import { createVenue, deleteVenue, myVenues, patchVenue, venueLink, type VenueSummary } from "../../lib/venueApi";

/** The owner's home: every venue with its runners, and a form to make a new one. */
export function OwnerVenues() {
  const [people, setPeople] = useState<Person[]>([]);
  const [venues, setVenues] = useState<VenueSummary[] | null>(null);
  const [vName, setVName] = useState("");
  const [vPin, setVPin] = useState("");
  const [vRunners, setVRunners] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const loadVenues = () =>
    myVenues()
      .then(setVenues)
      .catch(() => setVenues([]));
  useEffect(() => {
    void loadVenues();
    listPeople()
      .then(setPeople)
      .catch(() => undefined);
  }, []);

  const active = people.filter((u) => !u.revoked);
  async function addVenue() {
    try {
      const v = await createVenue({ name: vName.trim(), pin: vPin, runnerIds: vRunners });
      setNote(`Made ${v.name}. Open it to print its QR code: ${venueLink(v.id)}`);
      setVName("");
      setVPin("");
      setVRunners([]);
      void loadVenues();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not make the venue.");
    }
  }
  async function closeVenue(v: VenueSummary) {
    if (!confirm(`Close ${v.name}? Its QR code stops working and every sheet on it is deleted now.`)) return;
    await deleteVenue(v.id).catch(() => undefined);
    void loadVenues();
  }
  async function setRunners(v: VenueSummary, runnerIds: string[]) {
    await patchVenue(v.id, { runnerIds }).catch(() => undefined);
    void loadVenues();
  }

  return (
    <main className="steps">
      <header className="top">
        <h1>Venues</h1>
      </header>
      <section>
        <p className="sub">
          A venue is a place that runs pools, with one QR code and PIN that never change. Its runners (a main one and backups) post each week's pools and add
          their photos. You can do anything a runner can.
        </p>
        {venues === null && (
          <p className="msg" role="status">
            Loading…
          </p>
        )}
        {venues?.length === 0 && <p className="sub">No venues yet. Make one below.</p>}
        {venues?.map((v) => (
          <div key={v.id} className="person">
            <div>
              <b>{v.name}</b>
              <div className="sub">
                Runners:{" "}
                {active.map((u) => (
                  <label key={u.id} className="check">
                    <input
                      type="checkbox"
                      checked={v.runnerIds?.includes(u.id) ?? false}
                      onChange={(e) => setRunners(v, e.target.checked ? [...(v.runnerIds ?? []), u.id] : (v.runnerIds ?? []).filter((x) => x !== u.id))}
                    />
                    {u.name}
                  </label>
                ))}
                {active.length === 0 && "nobody invited yet (see People)"}
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
        <h2>Make a venue</h2>
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
          {active.map((u) => (
            <label key={u.id} className="check">
              <input
                type="checkbox"
                checked={vRunners.includes(u.id)}
                onChange={(e) => setVRunners(e.target.checked ? [...vRunners, u.id] : vRunners.filter((x) => x !== u.id))}
              />
              {u.name}
            </label>
          ))}
          {active.length === 0 && <p className="sub">Invite someone first (see People).</p>}
        </fieldset>
        <button className="primary" disabled={!vName.trim() || vPin.length < 4} onClick={addVenue}>
          Make the venue
        </button>
        {note && (
          <p className="sub" role="status">
            {note}
          </p>
        )}
      </section>
    </main>
  );
}
