import { DigitsEditor } from "../../components/DigitsEditor";
import { badRows } from "../../lib/digits";
import { deleteSheet, type Sheet } from "../../lib/sheetApi";

interface Props {
  id: string;
  token: string;
  sheet: Sheet;
  update: (patch: Partial<Sheet>) => void;
  onChangeGame: () => void;
}

/** Fix the teams, digits, game and overtime rule, or delete the sheet. Editors only. */
export function EditTab({ id, token, sheet, update, onChangeGame }: Props) {
  async function remove() {
    if (!confirm("Delete this sheet and its photo for good? Anyone with the link loses it too.")) return;
    try {
      await deleteSheet(id, token);
      location.assign("/");
    } catch {
      alert("Could not delete it. Try again.");
    }
  }
  return (
    <div className="fix">
      <h2>Edit details</h2>
      <p className="sub">Only needed if the teams, digits or game are wrong.</p>
      <div className="actions">
        <button onClick={onChangeGame}>Change the game</button>
      </div>
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
      {badRows(sheet.rows).length > 0 && (
        <p className="warn" role="alert">
          Each digit row must hold 0–9 exactly once.
        </p>
      )}
      <DigitsEditor mode={sheet.mode} rows={sheet.rows} teams={sheet.teams} onChange={(rows) => update({ rows })} />
      <label className="check">
        <input type="checkbox" checked={sheet.finalIncludesOvertime} onChange={(e) => update({ finalIncludesOvertime: e.target.checked })} /> Final score
        includes overtime
      </label>
      <div className="danger">
        <button onClick={remove}>Delete this sheet</button>
      </div>
    </div>
  );
}
