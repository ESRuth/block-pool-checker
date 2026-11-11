import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { GamePicker } from "../components/GamePicker";
import { PinGate } from "../components/PinGate";
import type { GameRef } from "../lib/gameApi";
import { gameDate, matchup } from "../lib/report";
import { enterVenue, getVenue, patchVenue, postSheet, venueLink, type VenueSheet, type VenueView } from "../lib/venueApi";

/** A venue's QR code scans to here: the PIN, then the sheets on it. Its runners (and the owner) also get the QR to print and the tools. */
export function VenuePage({ id }: { id: string }) {
  const [v, setV] = useState<VenueView | null | undefined>(undefined); // undefined = loading, null = no such venue
  const [error, setError] = useState("");
  const load = () =>
    getVenue(id)
      .then((r) => {
        setV(r);
        setError("");
      })
      .catch((e: Error & { status?: number }) =>
        e.status === 404 ? setV(null) : setError("Could not reach the server. Check your connection and try again."),
      );
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error)
    return (
      <main>
        <p className="msg" role="alert">
          {error}
        </p>
        <button onClick={load}>Try again</button>
      </main>
    );
  if (v === undefined)
    return (
      <main>
        <p className="msg" role="status">
          Loading…
        </p>
      </main>
    );
  if (v === null)
    return (
      <main>
        <header className="top">
          <h1>Not found</h1>
        </header>
        <p className="msg">This code doesn't open a venue. It may be incomplete, or the venue was closed.</p>
      </main>
    );
  if (v.pinRequired) return <PinGate heading={v.name} onEnter={async (pin) => (await enterVenue(id, pin), await load())} />;

  return (
    <main className="steps">
      <header className="top">
        <h1>{v.name}</h1>
      </header>
      <section aria-label="Sheets">
        <h2>This week</h2>
        {v.sheets?.length === 0 && <p className="sub">Nothing is up yet. Check back closer to game time.</p>}
        <div className="sheetlist">
          {v.sheets?.map((p, i) => (
            <SheetRow key={p.id ?? i} sheet={p} runner={!!v.canManage} />
          ))}
        </div>
      </section>
      {v.canManage && <PostSheet id={id} reload={load} />}
      {v.canManage && <Manage id={id} v={v} reload={load} />}
      <div className="footlinks">
        {v.canManage && <a href="/">Home</a>}
        <a href={v.canManage ? "/help#run" : "/help#watch"}>Help</a>
        <a href="/privacy">Privacy</a>
      </div>
    </main>
  );
}

const STAGE_WORD: Record<VenueSheet["stage"], string> = { posted: "Open for blocks", draft: "Draft", published: "", deleted: "Deleted" };

/**
 * One sheet in the venue's list. Viewers get a plain line for a sheet that is only posted (the game, the date, no way in) and a link for a
 * published one. Runners get every sheet with its stage in words, and a link to open it (a posted one opens to "add the photo").
 */
function SheetRow({ sheet: p, runner }: { sheet: VenueSheet; runner: boolean }) {
  const name = p.title || matchup(p.teams.top, p.teams.left);
  const word = STAGE_WORD[p.stage];
  const body = (
    <>
      <b>
        {word && <span className="tag">{word}</span>}
        {name}
      </b>
      <span className="sub">
        {p.title ? `${matchup(p.teams.top, p.teams.left)} · ` : ""}
        {gameDate(p.kickoff)}
        {p.ownPin ? " · has its own PIN" : ""}
        {p.stage === "posted" && !runner ? " · Not filled in yet. Ask at the venue to get a block." : ""}
      </span>
    </>
  );
  return p.id ? (
    <a className={p.stage === "deleted" ? "card sheetcard gone" : "card sheetcard"} href={`/s/${p.id}`}>
      {body}
      <span className="go" aria-hidden="true">
        ›
      </span>
    </a>
  ) : (
    <div className="card sheetcard">{body}</div>
  );
}

/** QR code and PIN: only for the people who run the venue. */
function Manage({ id, v, reload }: { id: string; v: VenueView; reload: () => Promise<unknown> }) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState(v.name);
  const [note, setNote] = useState("");
  const link = venueLink(id);

  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });

  const run = async (f: () => Promise<unknown>, done: string) => {
    try {
      await f();
      setNote(done);
      await reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't work.");
    }
  };

  return (
    <section className="sec" aria-label="Run this venue">
      <h2>Run this venue</h2>
      <p className="sub">Print this QR code once and leave it up all year: it never changes. Scanning it asks for the PIN, so it shows no names by itself.</p>
      <div className="qr" role="img" aria-label={`QR code for ${v.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="sub" style={{ wordBreak: "break-all" }}>
        {link}
      </p>
      <div className="actions">
        <button onClick={() => window.print()}>Print</button>
        <button
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => setNote("Link copied."))
              .catch(() => undefined)
          }
        >
          Copy link
        </button>
        <a className="bigbtn" href={`/new?venue=${encodeURIComponent(id)}`}>
          Add a sheet from a photo
        </a>
      </div>
      <p className="sub">Don't print the PIN next to the QR. Tell people in person or in your group chat.</p>
      {!!v.wrongTries && (
        <p className="warn" role="status">
          {v.wrongTries} wrong PIN {v.wrongTries === 1 ? "try" : "tries"} in a row
          {v.lockedUntil && Date.parse(v.lockedUntil) > Date.now() ? ", so it is locked for a few minutes" : ""}. If that wasn't you or a friend, choose a new
          PIN.
        </p>
      )}

      <h3>PIN</h3>
      <label className="field">
        New PIN (4 to 8 digits)
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} autoComplete="off" />
      </label>
      <div className="actions">
        <button
          disabled={pin.length < 4}
          onClick={() =>
            run(async () => {
              await patchVenue(id, { pin });
              setPin("");
            }, "PIN changed. Everyone has to enter the new one.")
          }
        >
          Change PIN
        </button>
      </div>

      <h3>Name</h3>
      <label className="field">
        Venue name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>
      <div className="actions">
        <button disabled={!name.trim() || name === v.name} onClick={() => run(() => patchVenue(id, { name: name.trim() }), "Name saved.")}>
          Save name
        </button>
      </div>

      {note && (
        <p className="sub" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

/**
 * The first step in the physical world: grab a blank sheet, look up the game, write one team across the top and the other down the side,
 * and post it. Here: pick the game, say which team goes where, and post it. Viewers see that it exists; the photo comes once the digits are drawn.
 */
function PostSheet({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<GameRef | null>(null);
  const [top, setTop] = useState<"away" | "home" | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const reset = () => {
    setOpen(false);
    setGame(null);
    setTop(null);
    setLabel("");
  };

  if (!open)
    return (
      <section className="sec" aria-label="Post a new sheet">
        <button className="primary" onClick={() => setOpen(true)}>
          Post a new sheet
        </button>
        {note && (
          <p className="sub" role="status">
            {note}
          </p>
        )}
      </section>
    );

  const sides = game && top ? { top: game[top], left: game[top === "away" ? "home" : "away"] } : null;
  return (
    <section className="sec" aria-label="Post a new sheet">
      <h2>Post a new sheet</h2>
      {!game && (
        <>
          <p className="sub">Which game is it for? Games that haven't started are listed, soonest first.</p>
          <GamePicker upcoming onPick={setGame} />
        </>
      )}
      {game && (
        <>
          <p className="sub">
            {game.away.nickname} at {game.home.nickname}, {gameDate(game.kickoff)}. Which team did you write across the top of the paper sheet?
          </p>
          <div className="actions">
            {(["away", "home"] as const).map((side) => (
              <button key={side} aria-pressed={top === side} onClick={() => setTop(side)}>
                {game[side].nickname} across the top
              </button>
            ))}
          </div>
          {sides && (
            <>
              <p className="sub">
                {sides.top.nickname} across the top, {sides.left.nickname} down the side.
              </p>
              <label className="field">
                Tag (optional)
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. $10" />
              </label>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    const top = sides.top.nickname;
                    const left = sides.left.nickname;
                    const d = new Date(game.kickoff);
                    const tag = label.trim() ? ` ${label.trim()}` : "";
                    await postSheet(id, {
                      teams: { top, left },
                      game: { gameId: game.gameId, kickoff: game.kickoff, status: game.status, home: game.home, away: game.away, label: game.label },
                      title: `${top} v ${left} ${d.getMonth() + 1}/${d.getDate()}${tag}`,
                    });
                    setNote("Posted. People with the PIN can see it is open for blocks. When the digits are drawn, add the photo.");
                    reset();
                    await reload();
                  } catch (e) {
                    setNote(e instanceof Error ? e.message : "That didn't work.");
                  }
                }}
              >
                Post it
              </button>
            </>
          )}
          <button className="linkbtn" onClick={() => setGame(null)}>
            Pick a different game
          </button>
        </>
      )}
      <button className="linkbtn" onClick={reset}>
        Cancel
      </button>
    </section>
  );
}
