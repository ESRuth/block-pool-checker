import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { navigate } from "../lib/router";

/**
 * Where a personal link lands (`/join#c=<key>`). The auth provider has already kept the key on this phone; once the server accepts it this page
 * steps aside and goes to Home (replacing itself, so the key is not left in the address bar or the history). Nothing to click.
 */
export function Join() {
  const { status } = useAuth();
  useEffect(() => {
    if (status === "signedIn") navigate("/", { replace: true });
  }, [status]);

  return (
    <main className="steps">
      <header className="top">
        <h1>Block Pool Checker</h1>
      </header>
      {status === "checking" && (
        <p className="msg" role="status">
          Signing you in…
        </p>
      )}
      {status === "offline" && (
        <p className="msg" role="alert">
          Your link is saved, but the server could not be reached to check it. Check your connection and reload this page.
        </p>
      )}
      {status === "signedOut" && (
        <p className="msg" role="alert">
          This link doesn't work (it may have been turned off). Ask the person who sent it for a new one.
        </p>
      )}
    </main>
  );
}
