import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { navigate } from "../lib/router";
import { myVenues, type VenueSummary } from "../lib/venueApi";
import { OwnerVenues } from "./owner/OwnerVenues";
import { SignIn } from "./SignIn";

/** Running as an installed home-screen app already (then the home-screen tip is not needed). */
const installed = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Home is the venues. The owner sees every venue and can make one; a runner sees the venues they run, and goes straight into it when
 * there is only one. Someone not signed in is asked for a code.
 */
export function Home() {
  const { status, me, refresh } = useAuth();
  if (status === "checking")
    return (
      <main>
        <p className="msg" role="status">
          Loading…
        </p>
      </main>
    );
  if (status === "offline")
    return (
      <main>
        <p className="msg" role="alert">
          Could not reach the server. You are still signed in; check your connection and try again.
        </p>
        <button onClick={() => void refresh()}>Try again</button>
      </main>
    );
  if (status === "signedOut" || !me) return <SignIn />;
  return me.owner ? <OwnerVenues /> : <RunnerHome />;
}

function RunnerHome() {
  const [venues, setVenues] = useState<VenueSummary[] | null>(null);
  useEffect(() => {
    myVenues()
      .then((v) => {
        if (v.length === 1)
          navigate(`/v/${encodeURIComponent(v[0]!.id)}`, { replace: true }); // one venue: nothing to choose
        else setVenues(v);
      })
      .catch(() => setVenues([]));
  }, []);
  return (
    <main>
      <header className="top">
        <h1>My venues</h1>
      </header>
      {venues === null && (
        <p className="msg" role="status">
          Loading…
        </p>
      )}
      {venues?.length === 0 && (
        <section className="sec">
          <h2>Nothing here yet</h2>
          <p className="sub">Sheets are posted on a venue by its runners. Ask the owner to make you a runner, then your venue appears here.</p>
        </section>
      )}
      <div className="sheetlist">
        {venues?.map((v) => (
          <a key={v.id} className="card sheetcard" href={`/v/${v.id}`}>
            <b>{v.name}</b>
            <span className="sub">QR code, PIN and this week's sheets</span>
            <span className="go" aria-hidden="true">
              ›
            </span>
          </a>
        ))}
      </div>
      {!installed() && (
        <p className="sub">Tip: put this on your home screen so it opens signed in. iPhone: Share, then Add to Home Screen. Android: menu, then Install app.</p>
      )}
    </main>
  );
}
