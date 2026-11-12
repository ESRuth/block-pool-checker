import { useEffect, useMemo, useState } from "react";
import { navigate } from "../lib/router";
import { teamMatches, type Quad, type ReadResult, type TeamRef } from "@bpc/engine";
import { snapGrid } from "@bpc/vision";
import { GamePicker } from "../components/GamePicker";
import { GridOverlay } from "../components/GridOverlay";
import { DigitsEditor } from "../components/DigitsEditor";
import type { GameRef } from "../lib/gameApi";
import { badRows, rowsFromRead, setsFor, type RowText } from "../lib/digits";
import { loadPhoto, type LoadedPhoto } from "../lib/photo";
import { ReadError, readPhoto, setInviteCode, type ReadResponse } from "../lib/readApi";
import { createSheet, fillSheet, loadSheet, type Sheet } from "../lib/sheetApi";

const teamRef = (t: { abbr: string; name: string; nickname: string; location?: string }): TeamRef => ({ ...t, location: t.location ?? "" });
/** Does the pair of team names on a sheet fit this game, in either order? */
const fitsGame = (top: string, left: string, g: Sheet["game"]) =>
  (teamMatches(top, teamRef(g.home)) && teamMatches(left, teamRef(g.away))) || (teamMatches(top, teamRef(g.away)) && teamMatches(left, teamRef(g.home)));

const toPx = (read: ReadResult, w: number, h: number) => read.grid_corners.map(([x, y]) => [(x * w) / 1000, (y * h) / 1000]) as unknown as Quad;

type Phase = "pick" | "reading" | "saving" | "error" | "questions";

/** Set-up flow: each question appears only if it's needed and disappears once answered. */
export function NewSheet() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<{ message: string; needInvite: boolean } | null>(null);
  const [invite, setInvite] = useState("");
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [resp, setResp] = useState<ReadResponse | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [teams, setTeams] = useState({ top: "", left: "" });
  const [teamsDone, setTeamsDone] = useState(false);
  const [rows, setRows] = useState<RowText>({});
  const [badAtStart, setBadAtStart] = useState<string[]>([]);
  const [digitsDone, setDigitsDone] = useState(false);
  const [game, setGame] = useState<GameRef | null>(null);
  const [zoom, setZoom] = useState(false);
  // Started from a sheet already posted on a venue's wall (`?sheet=<id>`): its game and teams are known, so those questions are skipped when the
  // photo agrees, and the photo is added to that sheet instead of making a new one. `?venue=<code>` alone makes a new sheet on that venue.
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const sheetId = q.get("sheet");
  const venueId = q.get("venue");
  const [posted, setPosted] = useState<{ teams: Sheet["teams"]; game: Sheet["game"] } | null>(null);
  // The posted sheet's game has to be known before a photo is read (it decides whether "Which game?" is asked), so the photo step waits for it.
  const [postedLoading, setPostedLoading] = useState(!!sheetId);
  useEffect(() => {
    if (sheetId)
      loadSheet(sheetId)
        .then((p) => setPosted({ teams: p.doc.teams, game: p.doc.game }))
        .catch(() => undefined) // without it the game is simply asked for
        .finally(() => setPostedLoading(false));
  }, [sheetId]);

  async function read(p: LoadedPhoto) {
    setPhase("reading");
    try {
      const r = await readPhoto(p.blob);
      const guess = toPx(r.read, p.width, p.height);
      let start = guess;
      try {
        start = snapGrid(p.gray, guess).corners;
      } catch {
        /* keep the model's guess */
      }
      const initial = rowsFromRead(r.read);
      setResp(r);
      setCorners(start);
      setTeams({ top: r.read.top_team ?? "", left: r.read.left_team ?? "" });
      setRows(initial);
      setBadAtStart(badRows(initial).map((b) => b.key));
      const readTop = r.read.top_team ?? "";
      const readLeft = r.read.left_team ?? "";
      if (posted && !readTop && !readLeft) {
        // Nothing written on the sheet: use the teams it was posted with.
        setTeams(posted.teams);
        setTeamsDone(true);
        setGame(posted.game);
      } else {
        setTeamsDone(!!(r.read.top_team && r.read.left_team));
        // The photo agrees with the posted game: no need to ask which game it is.
        if (posted && readTop && readLeft && fitsGame(readTop, readLeft, posted.game)) setGame(posted.game);
      }
      setDigitsDone(badRows(initial).length === 0 && Object.keys(initial).length === setsFor(r.read.digit_sets).length * 2);
      setPhase("questions");
    } catch (e) {
      if (e instanceof ReadError) setError({ message: e.status === 403 ? "This needs an access code." : e.message, needInvite: e.status === 403 });
      else setError({ message: "Could not reach the server. Check your connection and try again.", needInvite: false });
      setPhase("error");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPhase("reading");
    try {
      const p = await loadPhoto(file);
      setPhoto(p);
      await read(p);
    } catch {
      const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
      setError({
        message: heic
          ? "This browser cannot open HEIC photos (the iPhone's space-saving format). Choose the photo on the phone itself, or set the camera to Most Compatible, and try again."
          : "That file could not be opened as a photo. Try a JPEG or PNG.",
        needInvite: false,
      });
      setPhase("error");
    }
  }

  async function finish() {
    if (!photo || !corners || !resp || !game) return;
    setPhase("saving");
    try {
      const doc: Sheet = {
        schema_version: 1,
        width: photo.width,
        height: photo.height,
        corners,
        teams: { top: teams.top.trim(), left: teams.left.trim() },
        mode: resp.read.digit_sets,
        rows,
        game,
        finalIncludesOvertime: true,
        names: {},
        mine: [],
      };
      if (sheetId) {
        // The pool was posted before it had a photo: add the photo to it. It becomes a draft; the runner is already signed in by their key.
        await fillSheet(sheetId, doc, photo.blob);
        navigate(`/s/${sheetId}`);
        return;
      }
      // Started from a venue page ("Add a sheet from a photo"): it is made there as a draft; publishing it opens it to viewers.
      const { id } = await createSheet(venueId!, doc, photo.blob);
      navigate(`/s/${id}`);
    } catch {
      setError({ message: "Could not save the sheet. Check your connection and try again.", needInvite: false });
      setPhase("questions");
    }
  }

  // Four steps shown to the person: photo, details (teams and digits, only if needed), game, grid.
  const step = phase === "questions" && resp ? (!teamsDone || !digitsDone ? 2 : !game ? 3 : 4) : phase === "saving" ? 4 : 1;
  const stillBad = useMemo(() => badRows(rows).length > 0, [rows]);

  return (
    <main className="steps">
      <header className="top">
        <a href="/" className="back" aria-label="Home">
          ‹
        </a>
        <h1>New sheet</h1>
      </header>
      <div className="stepbar" role="img" aria-label={`Step ${step} of 4`}>
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= step ? "on" : ""} />
        ))}
      </div>

      {phase === "pick" && postedLoading && (
        <p className="msg" role="status">
          Loading the sheet…
        </p>
      )}
      {phase === "pick" && !postedLoading && (
        <section>
          <h2>Start with a photo</h2>
          <p className="sub">Get the whole sheet in view: the team names, every digit and every block.</p>
          <label className="bigbtn">
            Take or choose a photo
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <p className="sub">
            The photo is shrunk and stripped of location and camera data on your phone first. It's kept privately and deleted 7 days after the game.
          </p>
        </section>
      )}

      {phase === "saving" && (
        <p className="msg" role="status">
          Saving your sheet…
        </p>
      )}

      {phase === "questions" && error && (
        <p className="msg" role="alert">
          {error.message}
        </p>
      )}

      {phase === "reading" && (
        <p className="msg" role="status">
          Reading your sheet… about 10 seconds.
        </p>
      )}

      {phase === "error" && error && (
        <section>
          <p className="msg" role="alert">
            {error.message}
          </p>
          {error.needInvite && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setInviteCode(invite);
                if (photo) read(photo);
              }}
            >
              <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Access code" autoComplete="off" />
              <button disabled={!invite}>Try again</button>
            </form>
          )}
          <button
            className="linkbtn"
            onClick={() => {
              setError(null);
              setPhase("pick");
            }}
          >
            Choose a different photo
          </button>
        </section>
      )}

      {phase === "questions" && resp && !teamsDone && (
        <section>
          <h2>Which teams?</h2>
          <p className="sub">The names weren't visible on the sheet. Type them: the team whose digits run across the top, then the team down the side.</p>
          <div className="teams">
            <label>
              Top team
              <input value={teams.top} onChange={(e) => setTeams({ ...teams, top: e.target.value })} placeholder="e.g. Eagles" />
            </label>
            <label>
              Left team
              <input value={teams.left} onChange={(e) => setTeams({ ...teams, left: e.target.value })} placeholder="e.g. Commanders" />
            </label>
          </div>
          <button className="primary" disabled={!teams.top.trim() || !teams.left.trim()} onClick={() => setTeamsDone(true)}>
            Next
          </button>
        </section>
      )}

      {phase === "questions" && resp && teamsDone && !digitsDone && (
        <section>
          <h2>Check these digits</h2>
          <p className="sub">These rows couldn't be read cleanly. Each row must have 0–9 exactly once. Nothing is guessed.</p>
          <DigitsEditor mode={resp.read.digit_sets} rows={rows} teams={teams} onChange={setRows} only={badAtStart} />
          <button className="primary" disabled={stillBad} onClick={() => setDigitsDone(true)}>
            Next
          </button>
        </section>
      )}

      {phase === "questions" && resp && teamsDone && digitsDone && !game && (
        <section>
          <h2>Which game?</h2>
          <GamePicker top={teams.top.trim()} left={teams.left.trim()} onPick={setGame} />
        </section>
      )}

      {phase === "questions" && resp && photo && corners && game && (
        <section>
          <h2>Do the lines sit on the blocks?</h2>
          <p className="sub">
            The winning blocks and every name are found from this grid, so get it right now. Drag a corner circle, or tap “Snap to the lines”.
          </p>
          <div className={zoom ? "zoomwrap on" : "zoomwrap"}>
            <GridOverlay url={photo.url} width={photo.width} height={photo.height} corners={corners} onChange={setCorners} />
          </div>
          <div className="actions">
            <button onClick={() => setZoom(!zoom)}>{zoom ? "Zoom out" : "Zoom in"}</button>
            <button
              onClick={() => {
                try {
                  setCorners(snapGrid(photo.gray, corners).corners);
                } catch {
                  /* keep as is */
                }
              }}
            >
              Snap to the lines
            </button>
          </div>
          <button className="primary" onClick={finish}>
            Looks right: save
          </button>
          <button className="linkbtn" onClick={() => setGame(null)}>
            Pick a different game
          </button>
        </section>
      )}
    </main>
  );
}
