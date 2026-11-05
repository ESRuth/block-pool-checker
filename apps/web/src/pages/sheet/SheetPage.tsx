import { useEffect, useMemo, useState } from "react";
import { gridExtent } from "@bpc/engine";
import { GamePicker } from "../../components/GamePicker";
import { NextScores } from "./NextScores";
import { Results } from "./Results";
import { SquarePanel } from "./SquarePanel";
import { useGridHistory } from "../../hooks/useGridHistory";
import { useNameReading } from "../../hooks/useNameReading";
import { useGrayPhoto, usePhotoImage } from "../../hooks/usePhoto";
import { useScore } from "../../hooks/useScore";
import { useSheetDoc } from "../../hooks/useSheetDoc";
import { useSquares } from "../../hooks/useSquares";
import { EditTab } from "./EditTab";
import { FindTab } from "./FindTab";
import { GridBanners } from "./GridBanners";
import { HelpTab } from "./HelpTab";
import { NamesTab } from "./NamesTab";
import { PhotoCard } from "./PhotoCard";
import { Scoreboard } from "./Scoreboard";
import { ShareTab } from "./ShareTab";
import { winnerBoxes } from "../../lib/boxes";
import { rowsToDigits } from "../../lib/digits";
import { badge } from "../../lib/fresh";
import { fetchGameScore } from "../../lib/gameApi";
import { gameDate, matchup, reportLines } from "../../lib/report";
import { photoUrl, tokenFromHash } from "../../lib/sheetApi";
import { computeWinners } from "../../lib/winners";

type Tab = "squares" | "names" | "edit" | "share" | "help";

/** One saved sheet: the score, the winners, the photo with the winning squares boxed, and tabs for finding squares, names, editing, sharing and help. */
export function SheetPage({ id }: { id: string }) {
  const token = useMemo(() => tokenFromHash(location.hash), []);
  const url = photoUrl(id);
  const { sheet, canEdit, addedBy, loadError, saving, edit, update, latest } = useSheetDoc(id, token);
  const img = usePhotoImage(url);
  const squares = useSquares(sheet, edit);
  const history = useGridHistory(update);
  const names = useNameReading({ sheet, latest, canEdit, img, edit });
  const [adjust, setAdjust] = useState(false); // the grid is shown while setting up (NewSheet); a saved sheet opens with it hidden
  const gray = useGrayPhoto(url, canEdit && !!sheet && adjust);
  const [changingGame, setChangingGame] = useState(false);
  const [tab, setTab] = useState<Tab>("squares");

  // Live score; keeps polling until the game is final, and falls back to the last stored copy offline.
  const feed = useScore(`game.${sheet?.game.gameId ?? "none"}`, () => fetchGameScore(sheet!.game.gameId), !!sheet);

  const digits = useMemo(() => (sheet ? rowsToDigits(sheet.rows, sheet.mode) : null), [sheet]);
  const loaded = !!sheet;
  useEffect(() => {
    if (loaded && canEdit && !digits) setTab("edit"); // bad digits: open the tab that fixes them, once, when the sheet arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canEdit]);
  const outcome = useMemo(
    () => (sheet && digits && feed.score ? computeWinners(feed.score.snapshot, sheet.teams.top, sheet.teams.left, digits, sheet.finalIncludesOvertime) : null),
    [sheet, digits, feed.score],
  );
  const extent = useMemo(() => (sheet ? gridExtent(sheet.corners, sheet.width, sheet.height) : null), [sheet]);
  const outside = useMemo(() => new Set((extent?.cellsOutside ?? []).map((c) => `${c.row},${c.col}`)), [extent]);
  const boxes = useMemo(() => (outcome?.ok && sheet ? winnerBoxes(outcome.rows, sheet.corners, outside) : []), [outcome, sheet, outside]);
  const lines = useMemo(() => (outcome?.ok ? reportLines(outcome.rows, outside) : []), [outcome, outside]);

  if (loadError)
    return (
      <main>
        <p className="msg" role="alert">
          {loadError}
        </p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    );
  if (sheet === undefined)
    return (
      <main>
        <p className="msg" role="status">
          Loading…
        </p>
      </main>
    );
  if (sheet === null)
    return (
      <main>
        <header className="top">
          <a href="/" className="back" aria-label="Home">
            ‹
          </a>
          <h1>Sheet not found</h1>
        </header>
        <p className="msg">
          This link doesn't open a sheet. It may be incomplete, or the sheet was removed (they're deleted 30 days after the game).{" "}
          <a href="/new">Start a new one</a>.
        </p>
      </main>
    );

  const snap = feed.score?.snapshot;
  const status = feed.score ? badge(feed.score.snapshot, feed.serverNow, feed.offline) : null;
  const headline =
    snap && outcome?.ok && snap.status !== "scheduled" ? { top: snap.total[outcome.orientation.top], left: snap.total[outcome.orientation.left] } : null;
  const readingCells = new Set(names.reading || names.missing ? lines.flatMap((l) => (l.cell ? [l.cell] : [])) : []);
  const tabs: Array<[Tab, string]> = [
    ["squares", "Squares"],
    ["names", "Names"],
    ...(canEdit ? ([["edit", "Edit"]] as Array<[Tab, string]>) : []),
    ["share", "Share"],
    ["help", "Help"],
  ];

  return (
    <main className="sheetpage">
      <header className="shead">
        <a href="/" className="back" aria-label="My sheets">
          ‹
        </a>
        <div>
          <h1>{matchup(sheet.teams.top, sheet.teams.left)}</h1>
          <p className="when">
            {gameDate(sheet.game.kickoff)}
            {addedBy ? ` · Added by ${addedBy}` : ""}
          </p>
        </div>
      </header>

      {/* Fixed to the screen, not in the page flow: a badge appearing above the photo would shift it under a finger mid-drag. */}
      {canEdit && saving !== "saved" && (
        <span className="savebadge badge" role="status">
          {saving === "saving" ? "Saving…" : "Not saved: check your connection"}
        </span>
      )}

      <Scoreboard teams={sheet.teams} snap={snap} status={status} headline={headline} waiting={!feed.score} />

      {changingGame ? (
        <section className="sec">
          <h2>Which game?</h2>
          <GamePicker
            top={sheet.teams.top}
            left={sheet.teams.left}
            onPick={(g) => {
              update({ game: g });
              setChangingGame(false);
            }}
          />
          <button className="linkbtn" onClick={() => setChangingGame(false)}>
            Cancel
          </button>
        </section>
      ) : (
        <>
          {outcome && !outcome.ok && (
            <p className="warn" role="alert">
              {outcome.reason}
            </p>
          )}
          {!digits && (
            <p className="warn" role="alert">
              Some digits need fixing before winners can be found. Open the Edit tab below.
            </p>
          )}
          {outcome?.ok && (
            <section className="sec" aria-label="Winners">
              <h2>Winners</h2>
              <Results
                lines={lines}
                names={sheet.names}
                reading={readingCells}
                readOnly={!canEdit}
                mine={squares.mine}
                onName={(cell, text) => edit((c) => ({ ...c, names: { ...c.names, [cell]: { text, confirmed: text.trim() !== "" } } }))}
                onConfirm={(cell) => edit((c) => ({ ...c, names: { ...c.names, [cell]: { ...c.names[cell]!, confirmed: true } } }))}
              />
            </section>
          )}
          {outcome?.ok && digits && snap && snap.status === "in_progress" && (
            <NextScores
              rows={outcome.rows}
              digits={digits}
              names={sheet.names}
              teams={sheet.teams}
              mine={squares.mine}
              ball={outcome.ball}
              downDistance={outcome.downDistance}
              live={status?.tone === "live"}
            />
          )}
          <PhotoCard
            url={url}
            width={sheet.width}
            height={sheet.height}
            corners={sheet.corners}
            canEdit={canEdit}
            adjust={adjust}
            onToggleGrid={() => setAdjust(!adjust)}
            gray={gray}
            history={history}
            onCorners={(c) => update({ corners: c })}
            boxes={boxes}
            highlights={squares.highlights}
            onTap={squares.tapPhoto}
            incomplete={!!extent?.incomplete}
          />
        </>
      )}

      <GridBanners
        corners={sheet.corners}
        width={sheet.width}
        height={sheet.height}
        canEdit={canEdit}
        history={history}
        onCorners={(c) => update({ corners: c })}
        onRepaired={() => setAdjust(true)}
        gridMoved={names.gridMoved}
        readingNames={names.reading}
        onReread={() => names.readAll(true)}
      />

      <nav className="tabs" role="tablist" aria-label="More about this sheet">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="sec tabpanel" role="tabpanel">
        {tab === "squares" && (
          <FindTab
            sheet={sheet}
            canEdit={canEdit}
            squares={squares}
            results={outcome?.ok && digits ? { rows: outcome.rows, digits } : null}
            finished={snap?.status === "final"}
          />
        )}
        {tab === "names" && <NamesTab names={sheet.names} mine={squares.mine} onOpen={squares.setSelected} />}
        {tab === "edit" && canEdit && <EditTab id={id} token={token} sheet={sheet} update={update} onChangeGame={() => setChangingGame(true)} />}
        {tab === "share" && <ShareTab id={id} token={token} canEdit={canEdit} title={matchup(sheet.teams.top, sheet.teams.left)} />}
        {tab === "help" && <HelpTab canEdit={canEdit} />}
      </section>

      <div className="footlinks">
        <a href="/">My sheets</a>
        <a href="/new">Add another sheet</a>
      </div>

      {squares.selected && (
        <SquarePanel
          cell={squares.selected}
          img={img}
          corners={sheet.corners}
          entry={sheet.names[squares.selected]}
          mine={squares.mine.has(squares.selected)}
          canEdit={canEdit}
          rereading={names.rereading}
          findSame={(t) =>
            Object.entries(sheet.names)
              .filter(([, n]) => n.text.trim().toLowerCase() === t.trim().toLowerCase())
              .map(([k]) => k)
          }
          onName={(t) => squares.setName(squares.selected!, t)}
          onNameMany={squares.setNames}
          onToggleMine={() => squares.toggleMine(squares.selected!)}
          onReread={() => names.rereadSquare(squares.selected!)}
          onClose={() => squares.setSelected(null)}
        />
      )}
    </main>
  );
}
