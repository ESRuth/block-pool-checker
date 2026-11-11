import { useEffect, useState } from "react";
import { clearAccessKey, setAccessKey, whoAmI, type Me } from "../lib/access";
import { gameDate, matchup } from "../lib/report";
import { mySheets, type SheetSummary } from "../lib/sheetApi";
import { myVenues, type VenueSummary } from "../lib/venueApi";

export function Home() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = checking, null = not signed in
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);

  const start = () => {
    whoAmI().then((m) => {
      setMe(m);
      if (m) {
        mySheets()
          .then((l) => setSheets([...l.filter((x) => !x.deletedAt), ...l.filter((x) => x.deletedAt)]))
          .catch(() => setSheets([]));
        myVenues()
          .then(setVenues)
          .catch(() => setVenues([]));
      }
    });
  };
  useEffect(() => {
    // A home-screen icon made from a personal link opens here with the key in the #fragment: keep it, then tidy the address.
    const k = new URLSearchParams(location.hash.replace(/^#/, "")).get("c");
    if (k) {
      setAccessKey(k);
      history.replaceState(null, "", location.pathname);
    }
    start();
  }, []);

  if (me === undefined)
    return (
      <main>
        <header className="top">
          <h1>My Sheets</h1>
        </header>
        <p className="msg" role="status">
          Loading…
        </p>
      </main>
    );

  if (me === null) {
    return (
      <main className="steps">
        <header className="top">
          <h1>Block Pool Checker</h1>
        </header>
        <section>
          <h2>Enter your access code</h2>
          <p className="sub">
            Use the code or the personal link you were sent. If you have a link, just open it and you're in. <a href="/help">Help</a> ·{" "}
            <a href="/privacy">Privacy</a>
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAccessKey(code.trim());
              setWrong(false);
              const m = await whoAmI();
              if (m) {
                setCode("");
                start();
              } else {
                clearAccessKey();
                setWrong(true);
              }
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Access code"
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Access code"
            />
            <button className="primary" disabled={!code.trim()}>
              Continue
            </button>
          </form>
          {wrong && (
            <p className="warn" role="alert">
              That code didn't work. Check it and try again.
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="top">
        <h1>My Sheets</h1>
      </header>
      <a className="bigbtn" href="/new">
        Add a sheet from a photo
      </a>
      {venues.length > 0 && (
        <section aria-label="Your venues">
          <h2>Venues you run</h2>
          <div className="sheetlist">
            {venues.map((v) => (
              <a key={v.id} className="card sheetcard" href={`/v/${v.id}`}>
                <b>{v.name}</b>
                <span className="sub">QR code, PIN and this week's sheets</span>
                <span className="go" aria-hidden="true">
                  ›
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {sheets === null && (
        <p className="msg" role="status">
          Loading your sheets…
        </p>
      )}
      {sheets && sheets.length > 0 && (
        <section aria-label="Your sheets">
          {me.owner && <p className="sub">As the owner you see everyone's sheets.</p>}
          <div className="sheetlist">
            {sheets.map((s) => (
              <a key={s.id} className={s.deletedAt ? "card sheetcard gone" : "card sheetcard"} href={`/s/${s.id}`}>
                <b>
                  {s.deletedAt && <span className="tag">Deleted</span>}
                  {!s.deletedAt && s.draft && <span className="tag">Draft</span>}
                  {s.title || matchup(s.teams.top, s.teams.left)}
                </b>
                <span className="sub">
                  {s.deletedAt && s.goneOn ? `Gone for good ${new Date(s.goneOn).toLocaleDateString()} · ` : ""}
                  {gameDate(s.kickoff)}
                  {me.owner && s.createdBy ? ` · Added by ${s.createdBy}` : ""}
                </span>
                <span className="go" aria-hidden="true">
                  ›
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
      {sheets && sheets.length === 0 && (
        <section className="sec">
          <h2>No sheets yet</h2>
          <p className="sub">
            Add one from a photo of your pool sheet. The winners are found and kept up to date as the game goes. Sheets are kept 30 days after the game (7 days
            when they are on a venue).
          </p>
        </section>
      )}
      <div className="footlinks">
        <span className="sub">Signed in as {me.name}</span>
        <a href="/help">Help</a>
        <a href="/privacy">Privacy</a>
        {me.owner && <a href="/owner">Owner</a>}
        <button
          className="linkbtn"
          onClick={() => {
            clearAccessKey();
            setSheets(null);
            setMe(null);
          }}
        >
          Use a different code
        </button>
      </div>
    </main>
  );
}
