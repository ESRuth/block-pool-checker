import { cleanRow, rowKey, rowProblem, setsFor, type RowText } from "../lib/digits";
import type { ReadResult } from "@bpc/engine";

const SET_LABEL: Record<string, string> = { shared: "All payouts", Q1: "1st quarter", Half: "Halftime", Q3: "3rd quarter", Final: "Final" };

interface Props {
  mode: ReadResult["digit_sets"];
  rows: RowText;
  teams: { top: string; left: string };
  onChange: (rows: RowText) => void;
  /** Only show these rows (e.g. the ones that failed the 0-9 check), so a good read never makes the person look at digits. */
  only?: string[];
}

/** Editable digit rows with the hard stop: every row must hold 0-9 exactly once. Nothing is guessed. */
export function DigitsEditor({ mode, rows, teams, onChange, only }: Props) {
  return (
    <>
      {setsFor(mode).map((set) => {
        const keys = (["top", "left"] as const).map((axis) => ({ axis, key: rowKey(set, axis) })).filter((k) => !only || only.includes(k.key));
        if (!keys.length) return null;
        return (
          <fieldset key={set} className="digitset">
            <legend>{SET_LABEL[set]}</legend>
            {keys.map(({ axis, key }) => {
              const text = rows[key] ?? "";
              const problem = rowProblem(text);
              return (
                <label key={key} className={problem ? "bad" : ""}>
                  <span>{axis === "top" ? `${teams.top || "Top"} (across the top)` : `${teams.left || "Left"} (down the side)`}</span>
                  <input
                    className="digits"
                    inputMode="numeric"
                    autoComplete="off"
                    value={text}
                    aria-invalid={!!problem}
                    onChange={(e) => onChange({ ...rows, [key]: cleanRow(e.target.value) })}
                  />
                  {problem && <em role="alert">{problem}</em>}
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </>
  );
}
