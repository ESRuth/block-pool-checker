import type { DigitsOutcome } from "@bpc/engine";
import { PERIOD_NAME, outlook } from "../../lib/mine";
import { pretty } from "../../lib/report";
import type { NameEntry } from "../../lib/sheetApi";
import type { PeriodRow } from "../../lib/winners";

interface Props {
  rows: PeriodRow[];
  digits: NonNullable<DigitsOutcome["digits"]>;
  names: Record<string, NameEntry>;
  teams: { top: string; left: string };
  mine: Set<string>;
  ball?: "top" | "left";
  downDistance?: string;
  /** The score is a fresh fetch. When false the section says so instead of passing it off as current. */
  live: boolean;
}

/** Who leads the period being played, and who would lead after the next score. Built only from the real score; possession only orders the list. */
export function NextScores({ rows, digits, names, teams, mine, ball, downDistance, live }: Props) {
  const o = outlook(rows, digits, ball);
  if (!o) return null;
  const who = (cell: string) => {
    const n = names[cell];
    const text = n?.text.trim();
    return (
      <>
        <b>{text ? `${text}${n?.confirmed ? "" : " (unverified)"}` : "no name yet"}</b>
        {mine.has(cell) && <b className="yours"> ★ yours</b>}
      </>
    );
  };
  const teamName = (t: "top" | "left") => pretty(teams[t]);
  const sides: Array<"top" | "left"> = o.ball ? [o.ball, o.ball === "top" ? "left" : "top"] : ["top", "left"];
  return (
    <section className="sec nextscores" aria-label="What could happen next">
      <h2>If there's a score next</h2>
      <p className="sub">
        {teamName("top")} {o.now.top}, {teamName("left")} {o.now.left}. Leading {PERIOD_NAME[o.period]} now: {who(o.leader)}.{!live && " Score might be stale."}
      </p>
      {o.ball && (
        <p className="sub">
          {teamName(o.ball)} have the ball{downDistance ? ` (${downDistance})` : ""}, so their scores are listed first.
        </p>
      )}
      {sides.map((team) => (
        <div key={team}>
          <h3>
            {teamName(team)} score{o.ball === team ? " (with the ball)" : ""}
          </h3>
          <ul>
            {o.scenarios
              .filter((s) => s.team === team && s.common)
              .map((s) => (
                <li key={s.play}>
                  {s.play} ({s.score.top}-{s.score.left}): {who(s.cell)}
                </li>
              ))}
          </ul>
          <details>
            <summary>Other scores</summary>
            <ul>
              {o.scenarios
                .filter((s) => s.team === team && !s.common)
                .map((s) => (
                  <li key={s.play}>
                    {s.play} ({s.score.top}-{s.score.left}): {who(s.cell)}
                  </li>
                ))}
            </ul>
          </details>
        </div>
      ))}
    </section>
  );
}
