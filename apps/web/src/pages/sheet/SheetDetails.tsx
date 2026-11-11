import { useState } from "react";
import { DigitsEditor } from "../../components/DigitsEditor";
import { badRows } from "../../lib/digits";
import { gameWhen } from "../../lib/report";
import { deleteSheet, patchSettings, type Sheet } from "../../lib/sheetApi";

interface Props {
  id: string;
  sheet: Sheet;
  update: (patch: Partial<Sheet>) => void;
  /** The runner's short label ("$10"), and a way to tell the page it changed. */
  tag: string;
  onTag: (tag: string) => void;
  onChangeGame: () => void;
  /** A sheet that is only posted has no photo yet: no digits to fix, and the posted panel has its own "Take it down". */
  posted?: boolean;
  /** Called after the sheet is deleted (go back to its venue). */
  onDeleted: () => void;
}

/**
 * Everything that says what a sheet is: its game, which team is across the top, its tag and the overtime rule, and (once it has a photo) its digits.
 * The name and the day shown for a sheet come from the game. Editors only. Who can see it, its PIN and its venue are in the Access tab.
 */
export function SheetDetails({ id, sheet, update, tag, onTag, onChangeGame, posted = false, onDeleted }: Props) {
  const [name, setName] = useState(tag);
  const [note, setNote] = useState("");

  async function remove() {
    if (!confirm("Delete this sheet? It disappears for everyone. If it was a mistake, you can bring it back from the venue page.")) return;
    try {
      await deleteSheet(id);
      onDeleted();
    } catch {
      alert("Could not delete it. Try again.");
    }
  }
  async function saveTag() {
    try {
      const r = await patchSettings(id, { tag: name.trim() || null });
      onTag(r.tag ?? "");
      setNote("Tag saved.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  return (
    <div className="fix">
      <h2>Details</h2>
      <p className="sub">
        {gameWhen(sheet.game.kickoff)}
        <br />
        {sheet.game.away.nickname} at {sheet.game.home.nickname}
      </p>
      <div className="actions">
        <button onClick={onChangeGame}>Change the game</button>
      </div>

      <h3>Teams</h3>
      <p className="sub">
        {posted ? "Which team did you write across the top of the paper sheet?" : "As written on the paper sheet. Only needed if they are wrong."}
      </p>
      <div className="teams">
        <label>
          Top team
          <input value={sheet.teams.top} onChange={(e) => update({ teams: { ...sheet.teams, top: e.target.value } })} />
        </label>
        <label>
          Left team
          <input value={sheet.teams.left} onChange={(e) => update({ teams: { ...sheet.teams, left: e.target.value } })} />
        </label>
      </div>
      <div className="actions">
        <button onClick={() => update({ teams: { top: sheet.teams.left, left: sheet.teams.top } })}>Swap top and left</button>
      </div>

      <h3>Tag</h3>
      <p className="sub">A short label to tell two pools for the same game apart, such as the price.</p>
      <label className="field">
        Tag (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. $10" />
      </label>
      <div className="actions">
        <button onClick={saveTag} disabled={name.trim() === tag}>
          Save tag
        </button>
      </div>
      {note && (
        <p className="sub" role="status">
          {note}
        </p>
      )}

      <h3>Rules</h3>
      <label className="check">
        <input type="checkbox" checked={sheet.finalIncludesOvertime} onChange={(e) => update({ finalIncludesOvertime: e.target.checked })} /> Final score
        includes overtime
      </label>

      {!posted && (
        <>
          <h3>Digits</h3>
          {badRows(sheet.rows).length > 0 && (
            <p className="warn" role="alert">
              Each digit row must hold 0–9 exactly once.
            </p>
          )}
          <DigitsEditor mode={sheet.mode} rows={sheet.rows} teams={sheet.teams} onChange={(rows) => update({ rows })} />
          <div className="danger">
            <button onClick={remove}>Delete this sheet</button>
          </div>
        </>
      )}
    </div>
  );
}
