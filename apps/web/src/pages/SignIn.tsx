import { useState } from "react";
import { useAuth } from "../lib/auth";
import { navigate } from "../lib/router";

/** Where an access code is entered: the owner code, or a personal key. It is checked before it replaces anything already saved on this phone. */
export function SignIn() {
  const { me, signIn } = useAuth();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  return (
    <main className="steps">
      <header className="top">
        <h1>{me ? "Use a different code" : "Sign in"}</h1>
      </header>
      <section>
        <p className="sub">
          Use the code or the personal link you were sent. If you have a link, just open it and you're in.
          {me ? ` You are signed in as ${me.name} until a code is accepted.` : ""}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setNote("");
            const r = await signIn(code);
            if (r === "ok") navigate("/");
            else
              setNote(r === "offline" ? "Could not reach the server. Try again." : `That code didn't work.${me ? " You are still signed in as before." : ""}`);
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
        {note && (
          <p className="warn" role="alert">
            {note}
          </p>
        )}
      </section>
    </main>
  );
}
