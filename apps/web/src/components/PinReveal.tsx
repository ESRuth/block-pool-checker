import { useEffect, useState } from "react";

const HIDE_AFTER_MS = 20_000;

/**
 * "Show PIN" for the people who run a venue or sheet. The PIN is fetched only when asked for, kept on screen for a short while, then hidden again,
 * so it is not sitting there in a screenshot or over a shoulder. Remount it (change its `key`) after the PIN changes.
 */
export function PinReveal({ load }: { load: () => Promise<string | null> }) {
  const [pin, setPin] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pin) return;
    const t = setTimeout(() => setPin(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [pin]);

  async function show() {
    setBusy(true);
    setNote("");
    try {
      const p = await load();
      if (p) setPin(p);
      else setNote("This PIN was set before it could be shown. Set a new one once and it will show here.");
    } catch {
      setNote("Could not get the PIN. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pinreveal">
      {pin ? (
        <p>
          PIN: <output className="pinvalue">{pin}</output>{" "}
          <button className="linkbtn" onClick={() => setPin(null)}>
            Hide
          </button>
        </p>
      ) : (
        <button onClick={show} disabled={busy}>
          Show PIN
        </button>
      )}
      {note && (
        <p className="sub" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
