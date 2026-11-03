import { useEffect, useState } from "react";
import { setAccessKey, whoAmI, type Me } from "../lib/access";

/**
 * Where a personal link lands (`/join#c=<key>`). It keeps the key on this phone, says who it is, and stays put so
 * "Add to Home Screen" from this page makes an icon that opens already signed in. A home-screen icon made this way
 * opens the home page with the key attached, so it also re-saves the key if the phone cleared it.
 */
export function Join() {
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    const k = new URLSearchParams(location.hash.replace(/^#/, "")).get("c");
    if (k) setAccessKey(k);
    whoAmI().then((m) => {
      setMe(m);
      setState(m ? "ok" : "bad");
    });
  }, []);

  return (
    <main className="steps">
      <header className="top">
        <h1>Block Pool Checker</h1>
      </header>
      {state === "checking" && (
        <p className="msg" role="status">
          Checking your link…
        </p>
      )}
      {state === "bad" && (
        <p className="msg" role="alert">
          This link doesn't work (it may have been turned off). Ask the person who sent it for a new one.
        </p>
      )}
      {state === "ok" && me && (
        <section>
          <h2>You're in{me.owner ? "" : `, ${me.name}`}.</h2>
          <p className="sub">This phone is signed in; you won't be asked for a code.</p>
          <a className="bigbtn" href="/">
            Open My Sheets
          </a>
          <h2>Put it on your home screen</h2>
          <p className="sub">
            Do this from this page so the icon opens signed in. iPhone: tap Share, then Add to Home Screen. Android: tap the menu, then Install app or Add to
            Home screen.
          </p>
        </section>
      )}
    </main>
  );
}
