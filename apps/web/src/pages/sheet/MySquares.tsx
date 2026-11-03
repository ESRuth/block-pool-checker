import type { DigitsOutcome, Period } from "@bpc/engine";
import { PERIOD_NAME, endingsFor, myWins, outlook } from "../../lib/mine";
import { pretty } from "../../lib/report";
import type { NameEntry } from "../../lib/sheetApi";
import type { PeriodRow } from "../../lib/winners";

const BADGE: Record<Period, string> = { Q1: "1", Half: "2", Q3: "3", Final: "F" };

interface Props {
  mine: Set<string>;
  names: Record<string, NameEntry>;
  rows: PeriodRow[];
  digits: NonNullable<DigitsOutcome["digits"]>;
  teams: { top: string; left: string };
  /** The game is over: no outlook, and "none won" is a real answer. */
  finished: boolean;
}

/** What your marked squares have won, could win next, and need to win. Only ever built from the real score. */
export function MySquares({ mine, names, rows, digits, teams, finished }: Props) {
  const label = (cell: string) => names[cell]?.text.trim() || "a square with no name";
  const wins = myWins(rows, mine);
  const out = finished ? null : outlook(rows, digits, mine);
  const periods: Period[] = "shared" in digits ? ["Q1"] : ["Q1", "Half", "Q3", "Final"];
  const cells = [...mine].sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number) as [number, number],
      [br, bc] = b.split(",").map(Number) as [number, number];
    return ar - br || ac - bc;
  });

  return (
    <div className="mysq" aria-label="Your squares">
      <h3>Your results</h3>

      {wins.length > 0 && (
        <ul className="mywins">
          {wins.map((w) => (
            <li key={w.period}>
              <span className="mbadge">{BADGE[w.period]}</span>
              <span>
                {w.official ? `You won ${PERIOD_NAME[w.period]}` : `You're winning ${PERIOD_NAME[w.period]} right now`} ({w.score.top}-{w.score.left}) with{" "}
                {label(w.cell)}.
              </span>
            </li>
          ))}
        </ul>
      )}
      {finished && wins.length === 0 && <p className="sub">None of your squares won this game.</p>}

      {out && (
        <div className="outlook">
          <h3>Could win {PERIOD_NAME[out.period]}</h3>
          <p className="sub">
            It's {pretty(teams.top)} {out.now.top}, {pretty(teams.left)} {out.now.left} now. The next score would put one of your squares in the lead if:
          </p>
          {out.chances.length > 0 ? (
            <ul>
              {out.chances.map((c) => (
                <li key={`${c.team}${c.play}`}>
                  <b>{pretty(teams[c.team])}</b> score {c.play} ({c.score.top}-{c.score.left}): {label(c.cell)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">Nothing: none of your squares wins from one score alone.</p>
          )}
        </div>
      )}

      <details className="needs">
        <summary>What each of your squares needs to win</summary>
        <p className="sub">
          Each pair is the last digit of the {pretty(teams.top)} score, then the {pretty(teams.left)} score. For example 7-4 wins when the {pretty(teams.top)}{" "}
          score ends in 7 and the {pretty(teams.left)} score ends in 4.
        </p>
        <table>
          <thead>
            <tr>
              <th>Square</th>
              {periods.map((p) => (
                <th key={p}>{"shared" in digits ? "Any period" : BADGE[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c}>
                <td>{names[c]?.text.trim() || "No name"}</td>
                {periods.map((p) => {
                  const e = endingsFor(digits, p, c);
                  return (
                    <td key={p}>
                      {e.top}-{e.left}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
