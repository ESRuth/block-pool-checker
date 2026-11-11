import type { Sheet } from "../../lib/sheetApi";
import type { PeriodRow } from "../../lib/winners";
import { MyBlocks } from "./MyBlocks";
import type { useBlocks } from "../../hooks/useBlocks";

interface Props {
  sheet: Sheet;
  canEdit: boolean;
  blocks: ReturnType<typeof useBlocks>;
  /** Winners and digits, present only when the score and digits allow them. */
  results: { rows: PeriodRow[]; digits: NonNullable<Parameters<typeof MyBlocks>[0]["digits"]> } | null;
  finished: boolean;
}

/** Find blocks by name, mark them as yours, and (once marked) see what they have won or could win. */
export function FindTab({ sheet, canEdit, blocks: s, results, finished }: Props) {
  const q = s.query.trim();
  return (
    <div className="finder">
      <h2>Find your blocks</h2>
      <input
        value={s.query}
        onChange={(e) => s.setQuery(e.target.value)}
        placeholder="Type a name, e.g. Sam"
        autoComplete="off"
        aria-label="Find blocks by name"
      />
      {q && (
        <div className="actions">
          <span className="sub">{s.matches.length === 0 ? "No blocks match." : `${s.matches.length} block${s.matches.length === 1 ? "" : "s"} found.`}</span>
          {s.matches.some((k) => !s.mine.has(k)) && <button onClick={() => s.markAll(s.matches)}>Mark these as mine</button>}
        </div>
      )}
      {q && s.maybes.length > 0 && (
        <div>
          <p className="sub">Maybe also (read a little differently):</p>
          <div className="chips">
            {s.maybes.map((k) => (
              <button key={k} onClick={() => s.setSelected(k)}>
                {sheet.names[k]?.text}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="sub">
        {s.mine.size ? `${s.mine.size} block${s.mine.size === 1 ? "" : "s"} marked as yours. ` : ""}Tap any block on the photo for a close-up.
        {canEdit ? "" : " Marks you make here aren't saved."}
      </p>
      {s.mine.size > 0 && <button onClick={s.clearMine}>Clear my blocks</button>}
      {results && s.mine.size > 0 && (
        <MyBlocks mine={s.mine} names={sheet.names} rows={results.rows} digits={results.digits} teams={sheet.teams} finished={finished} />
      )}
    </div>
  );
}
