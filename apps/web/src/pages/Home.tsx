import { useEffect, useState } from "react";
import { clearAccessKey, setAccessKey, whoAmI, type Me } from "../lib/access";
import { gameDate, matchup } from "../lib/report";
import { mySheets, type SheetSummary } from "../lib/sheetApi";

export function Home() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = checking, null = not signed in
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);

  const start = () => {
    whoAmI().then((m) => {
      setMe(m);
      if (m)
        mySheets()
          .then(setSheets)
          .catch(() => setSheets([]));
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
          <p className="sub">Use the code or the personal link you were sent. If you have a link, just open it and you're in.</p>
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
              <a key={s.id} className="card sheetcard" href={`/s/${s.id}`}>
                <b>{matchup(s.teams.top, s.teams.left)}</b>
                <span className="sub">
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
            Add one from a photo of your pool sheet. The winners are found and kept up to date as the game goes. Sheets are kept 30 days after the game.
          </p>
        </section>
      )}
      <div className="footlinks">
        <span className="sub">Signed in as {me.name}</span>
        {me.owner && <a href="/admin">People</a>}
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
