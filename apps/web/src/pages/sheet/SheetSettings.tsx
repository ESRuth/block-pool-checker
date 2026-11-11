import { useEffect, useState } from "react";
import { patchSettings, type SheetSettings as Settings } from "../../lib/sheetApi";
import { myVenues, type VenueSummary } from "../../lib/venueApi";

interface Props {
  id: string;
  title: string;
  /** When this sheet is removed (ISO), shown to the runner. */
  expiresAt: string;
  settings?: Settings;
  /** Called with whatever the server says is now true. */
  onChanged: (m: { title?: string; settings: Settings; expiresAt: string }) => void;
}

/** For editors: this sheet's name, whether it is published, its own PIN (overrides the venue's) and whether viewers may see the photo. */
export function SheetSettings({ id, title, expiresAt, settings, onChanged }: Props) {
  const [name, setName] = useState(title);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    myVenues()
      .then(setVenues)
      .catch(() => setVenues([]));
  }, []);

  async function save(patch: Parameters<typeof patchSettings>[1], done: string) {
    try {
      const r = await patchSettings(id, patch);
      onChanged({ title: r.title, settings: r.settings, expiresAt: r.expiresAt });
      setNote(done);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  const venue = venues.find((v) => v.id === settings?.venueId);

  return (
    <div className="settings">
      <h3>This sheet</h3>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Team A v Team B 11/11 $10" />
      </label>
      <div className="actions">
        <button onClick={() => save({ title: name.trim() || null }, "Name saved.")}>Save name</button>
      </div>

      <h3>Who can see it</h3>
      <p className="sub">
        {venue ? (
          <>
            On <a href={`/v/${venue.id}`}>{venue.name}</a>: people open it with that venue's QR code and PIN.
          </>
        ) : (
          "People open it with the venue's QR code and PIN."
        )}{" "}
        {expiresAt ? `This sheet is removed on ${new Date(expiresAt).toLocaleDateString()}.` : ""}
      </p>
      <p className="sub">
        {settings?.draft
          ? "This sheet is a draft: only the people who run the venue can see it."
          : "This sheet is published: people with the venue's PIN can open it."}
      </p>
      <div className="actions">
        {settings?.draft ? (
          <button onClick={() => save({ draft: false }, "Published.")}>Publish</button>
        ) : (
          <button onClick={() => save({ draft: true }, "Back to a draft: hidden from viewers.")}>Hide it again (back to a draft)</button>
        )}
      </div>

      <h3>PIN for this sheet only</h3>
      <p className="sub">
        {settings?.hasPin
          ? "This sheet has its own PIN, which replaces the venue's. Choosing a new one signs everyone out."
          : "Optional. A PIN here protects just this sheet, even without a venue. Use 4 to 8 digits."}
      </p>
      <label className="field">
        PIN
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} autoComplete="off" />
      </label>
      <div className="actions">
        <button
          disabled={pin.length < 4}
          onClick={() => {
            save({ pin }, "PIN saved.");
            setPin("");
          }}
        >
          Set PIN
        </button>
        {settings?.hasPin && <button onClick={() => save({ pin: null }, "PIN removed.")}>Remove PIN</button>}
      </div>

      <h3>Photo</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={!!settings?.showPhoto}
          onChange={(e) => save({ showPhoto: e.target.checked }, e.target.checked ? "Viewers can see the photo." : "Viewers see names only.")}
        />
        Let viewers see the photo
      </label>
      <p className="sub">
        The photo shows handwriting and may show phone numbers. With a venue or a PIN, viewers see the names and winners but not the photo unless this is on.
      </p>
      {note && (
        <p className="sub" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
