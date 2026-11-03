import type { Sheet } from "../../lib/sheetApi";
import type { PeriodRow } from "../../lib/winners";
import { MySquares } from "./MySquares";
import type { useSquares } from "../../hooks/useSquares";

interface Props {
  sheet: Sheet;
  canEdit: boolean;
  squares: ReturnType<typeof useSquares>;
  /** Winners and digits, present only when the score and digits allow them. */
  results: { rows: PeriodRow[]; digits: NonNullable<Parameters<typeof MySquares>[0]["digits"]> } | null;
  finished: boolean;
}

/** Find squares by name, mark them as yours, and (once marked) see what they have won or could win. */
export function FindTab({ sheet, canEdit, squares: s, results, finished }: Props) {
  const q = s.query.trim();
  return (
    <div className="finder">
      <h2>Find your squares</h2>
      <input
        value={s.query}
        onChange={(e) => s.setQuery(e.target.value)}
        placeholder="Type a name, e.g. Emil"
        autoComplete="off"
        aria-label="Find squares by name"
      />
      {q && (
        <div className="actions">
          <span className="sub">{s.matches.length === 0 ? "No squares match." : `${s.matches.length} square${s.matches.length === 1 ? "" : "s"} found.`}</span>
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
        {s.mine.size ? `${s.mine.size} square${s.mine.size === 1 ? "" : "s"} marked as yours. ` : ""}Tap any square on the photo for a close-up.
        {canEdit ? "" : " Marks you make here aren't saved."}
      </p>
      {s.mine.size > 0 && <button onClick={s.clearMine}>Clear my squares</button>}
      {results && s.mine.size > 0 && (
        <MySquares mine={s.mine} names={sheet.names} rows={results.rows} digits={results.digits} teams={sheet.teams} finished={finished} />
      )}
    </div>
  );
}
