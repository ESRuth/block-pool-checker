import { useEffect, useMemo, useState } from "react";
import { gridExtent } from "@bpc/engine";
import { GamePicker } from "../../components/GamePicker";
import { PinGate } from "../../components/PinGate";
import { NextScores } from "./NextScores";
import { Results } from "./Results";
import { BlockPanel } from "./BlockPanel";
import { useGridHistory } from "../../hooks/useGridHistory";
import { useNameReading } from "../../hooks/useNameReading";
import { useGrayPhoto, usePhotoImage, usePhotoSrc } from "../../hooks/usePhoto";
import { useScore } from "../../hooks/useScore";
import { useSheetDoc } from "../../hooks/useSheetDoc";
import { useBlocks } from "../../hooks/useBlocks";
import { EditTab } from "./EditTab";
import { FindTab } from "./FindTab";
import { GridBanners } from "./GridBanners";
import { HelpTab } from "./HelpTab";
import { NamesTab } from "./NamesTab";
import { PhotoCard } from "./PhotoCard";
import { Scoreboard } from "./Scoreboard";
import { SheetSettings } from "./SheetSettings";
import { winnerBoxes } from "../../lib/boxes";
import { rowsToDigits } from "../../lib/digits";
import { badge } from "../../lib/fresh";
import { fetchGameScore } from "../../lib/gameApi";
import { gameDate, matchup, reportLines } from "../../lib/report";
import { navigate } from "../../lib/router";
import { deleteSheet, eraseSheet, enterSheet, patchSettings, restoreSheet } from "../../lib/sheetApi";
import { computeWinners } from "../../lib/winners";

type Tab = "blocks" | "names" | "edit" | "settings" | "help";

/** One saved sheet: the score, the winners, the photo with the winning blocks boxed, and tabs for finding blocks, names, editing, settings (runners) and help. */
export function SheetPage({ id }: { id: string }) {
  const { sheet, canEdit: canEditSheet, addedBy, loadError, saving, edit, update, latest, pinTitle, meta, setMeta, reload } = useSheetDoc(id);
  const back = meta.venueId ? `/v/${encodeURIComponent(meta.venueId)}` : "/"; // the venue's page lists the other sheets
  const canEdit = canEditSheet && !meta.deleted; // a deleted sheet opens read-only, with a way to restore it
  const url = usePhotoSrc(id, !!sheet && meta.hasPhoto); // empty when this viewer is not shown the photo
  const img = usePhotoImage(url);
  const blocks = useBlocks(sheet, edit);
  const history = useGridHistory(update);
  const names = useNameReading({ sheet, latest, canEdit, img, edit });
  const [adjust, setAdjust] = useState(false); // the grid is shown while setting up (NewSheet); a saved sheet opens with it hidden
  const gray = useGrayPhoto(url, canEdit && !!sheet && adjust);
  const [changingGame, setChangingGame] = useState(false);
  const [tab, setTab] = useState<Tab>("blocks");

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
  const outside = useMemo(() => new Set((extent?.blocksOutside ?? []).map((c) => `${c.row},${c.col}`)), [extent]);
  const boxes = useMemo(() => (outcome?.ok && sheet ? winnerBoxes(outcome.rows, sheet.corners, outside) : []), [outcome, sheet, outside]);
  const lines = useMemo(() => (outcome?.ok ? reportLines(outcome.rows, outside) : []), [outcome, outside]);

  if (pinTitle !== null) return <PinGate heading={pinTitle || "This sheet has a PIN"} onEnter={async (pin) => (await enterSheet(id, pin), reload())} />;
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
          <a href={back} className="back" aria-label="Back">
            ‹
          </a>
          <h1>Sheet not found</h1>
        </header>
        <p className="msg">This link doesn't open a sheet. It may be incomplete, or the sheet was removed (they're deleted 7 days after the game).</p>
      </main>
    );

  // Posted but no photo yet: the pool is on the venue's wall and has no grid, names or digits to show. The only next step is the photo.
  if (meta.settings?.posted)
    return (
      <main>
        <header className="top">
          <a href={back} className="back" aria-label="Back">
            ‹
          </a>
          <h1>{meta.title || matchup(sheet.teams.top, sheet.teams.left)}</h1>
        </header>
        <section className="sec" aria-label="Posted sheet">
          <p>
            <b>Posted.</b> People with the venue's PIN can see that this sheet is open for blocks. When the blocks are filled and the digits are drawn, add the
            photo of the sheet.
          </p>
          <p className="sub">
            {matchup(sheet.teams.top, sheet.teams.left)} · {gameDate(sheet.game.kickoff)}
          </p>
          <div className="actions">
            <a className="bigbtn" href={`/new?sheet=${encodeURIComponent(id)}`}>
              Add the photo (digits drawn)
            </a>
            <button
              onClick={() => {
                if (confirm("Take this sheet down? If it was a mistake, you can bring it back from the venue page."))
                  deleteSheet(id)
                    .then(() => navigate(back))
                    .catch(() => alert("Could not take it down. Try again."));
              }}
            >
              Take it down
            </button>
          </div>
        </section>
      </main>
    );

  const snap = feed.score?.snapshot;
  const status = feed.score ? badge(feed.score.snapshot, feed.serverNow, feed.offline) : null;
  const headline =
    snap && outcome?.ok && snap.status !== "scheduled" ? { top: snap.total[outcome.orientation.top], left: snap.total[outcome.orientation.left] } : null;
  const readingBlocks = new Set(names.reading || names.missing ? lines.flatMap((l) => (l.block ? [l.block] : [])) : []);
  const tabs: Array<[Tab, string]> = [
    ["blocks", "Blocks"],
    ["names", "Names"],
    ...(canEdit
      ? ([
          ["edit", "Edit"],
          ["settings", "Settings"],
        ] as Array<[Tab, string]>)
      : []),
    ["help", "Help"],
  ];

  return (
    <main className="sheetpage">
      <header className="shead">
        <a href={back} className="back" aria-label="Back">
          ‹
        </a>
        <div>
          <h1>{meta.title || matchup(sheet.teams.top, sheet.teams.left)}</h1>
          <p className="when">
            {meta.title ? `${matchup(sheet.teams.top, sheet.teams.left)} · ` : ""}
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

      {meta.deleted && (
        <section className="sec deletedbar" role="status" aria-label="Deleted sheet">
          <p>
            <b>This sheet is deleted.</b> Only you can see it. It is gone for good on {new Date(meta.deleted.goneOn).toLocaleDateString()}.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                restoreSheet(id)
                  .then(reload)
                  .catch(() => alert("Could not restore it. Try again."))
              }
            >
              Restore this sheet
            </button>
            {meta.deleted.canErase && (
              <button
                onClick={() => {
                  if (confirm("Delete this sheet and its photo for good? It cannot be restored after this."))
                    eraseSheet(id)
                      .then(() => navigate(back))
                      .catch(() => alert("Could not delete it. Try again."));
                }}
              >
                Delete for good
              </button>
            )}
          </div>
        </section>
      )}

      {canEdit && meta.settings?.draft && (
        <section className="sec draftbar" role="status" aria-label="Draft">
          <p>
            <b>Draft.</b> Only you and the other runners can see this sheet. Check the grid and the names, then publish it so people with the venue's PIN can
            open it.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                patchSettings(id, { draft: false })
                  .then((r) => setMeta((m) => ({ ...m, settings: r.settings })))
                  .catch(() => alert("Could not publish it. Try again."))
              }
            >
              Publish
            </button>
          </div>
        </section>
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
                reading={readingBlocks}
                readOnly={!canEdit}
                mine={blocks.mine}
                onName={(block, text) => edit((c) => ({ ...c, names: { ...c.names, [block]: { text, confirmed: text.trim() !== "" } } }))}
                onConfirm={(block) => edit((c) => ({ ...c, names: { ...c.names, [block]: { ...c.names[block]!, confirmed: true } } }))}
              />
            </section>
          )}
          {outcome?.ok && digits && snap && snap.status === "in_progress" && (
            <NextScores
              rows={outcome.rows}
              digits={digits}
              names={sheet.names}
              teams={sheet.teams}
              mine={blocks.mine}
              ball={outcome.ball}
              downDistance={outcome.downDistance}
              live={status?.tone === "live"}
            />
          )}
          {url && (
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
              highlights={blocks.highlights}
              onTap={blocks.tapPhoto}
              incomplete={!!extent?.incomplete}
            />
          )}
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
        {tab === "blocks" && (
          <FindTab
            sheet={sheet}
            canEdit={canEdit}
            blocks={blocks}
            results={outcome?.ok && digits ? { rows: outcome.rows, digits } : null}
            finished={snap?.status === "final"}
          />
        )}
        {tab === "names" && <NamesTab names={sheet.names} mine={blocks.mine} onOpen={blocks.setSelected} />}
        {tab === "edit" && canEdit && (
          <EditTab id={id} sheet={sheet} onDeleted={() => navigate(back)} update={update} onChangeGame={() => setChangingGame(true)} />
        )}
        {tab === "settings" && canEdit && (
          <SheetSettings
            id={id}
            title={meta.title ?? ""}
            expiresAt={meta.expiresAt}
            settings={meta.settings}
            onChanged={(m) => setMeta((cur) => ({ ...cur, ...m, venueId: m.settings?.venueId ?? cur.venueId }))}
          />
        )}
        {tab === "help" && <HelpTab canEdit={canEdit} />}
      </section>

      {blocks.selected && (
        <BlockPanel
          block={blocks.selected}
          img={img}
          corners={sheet.corners}
          entry={sheet.names[blocks.selected]}
          mine={blocks.mine.has(blocks.selected)}
          canEdit={canEdit}
          rereading={names.rereading}
          findSame={(t) =>
            Object.entries(sheet.names)
              .filter(([, n]) => n.text.trim().toLowerCase() === t.trim().toLowerCase())
              .map(([k]) => k)
          }
          onName={(t) => blocks.setName(blocks.selected!, t)}
          onNameMany={blocks.setNames}
          onToggleMine={() => blocks.toggleMine(blocks.selected!)}
          onReread={() => names.rereadBlock(blocks.selected!)}
          onClose={() => blocks.setSelected(null)}
        />
      )}
    </main>
  );
}
