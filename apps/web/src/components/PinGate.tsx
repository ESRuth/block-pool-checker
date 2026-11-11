import { useState } from "react";

/** Asks for a PIN. `onEnter` should throw an Error whose message is shown (wrong PIN, or locked for a while). */
export function PinGate({ heading, note, onEnter }: { heading: string; note?: string; onEnter: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="steps">
      <header className="top">
        <h1>{heading}</h1>
      </header>
      <section>
        <p className="sub">
          {note ?? "Enter the PIN you were given. You only need to do this once on this phone. Don't have it? Ask the person running the pool."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onEnter(pin.trim());
            } catch (err) {
              setError(err instanceof Error ? err.message : "That didn't work.");
              setPin("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            PIN
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="off" maxLength={8} />
          </label>
          <button className="primary" disabled={pin.trim().length < 4 || busy}>
            Open
          </button>
        </form>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        <p className="sub">
          <a href="/privacy">Privacy policy</a>
        </p>
      </section>
    </main>
  );
}
