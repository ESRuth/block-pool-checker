import type { ScoreSnapshot } from "@bpc/engine";
import { badge } from "../../lib/fresh";
import { pretty } from "../../lib/report";

interface Props {
  teams: { top: string; left: string };
  snap: ScoreSnapshot | undefined;
  /** The score and the clock it is aged against; absent until the first score arrives. */
  status: ReturnType<typeof badge> | null;
  headline: { top: number; left: number } | null;
  waiting: boolean;
}

/** The live status badge and the two team scores. */
export function Scoreboard({ teams, snap, status, headline, waiting }: Props) {
  return (
    <section className="sec scoreboard" aria-label="Score">
      <div className="scorerow">
        {status && (
          <span className={`badge ${status.tone}`} role="status">
            {status.text}
          </span>
        )}
        {snap && snap.status !== "final" && snap.status !== "scheduled" && <span className="detail-text">{snap.statusDetail}</span>}
      </div>
      {headline ? (
        <div className="teamscores">
          <div>
            <span className="tname">{pretty(teams.top)}</span>
            <b className="tscore">{headline.top}</b>
          </div>
          <div>
            <span className="tname">{pretty(teams.left)}</span>
            <b className="tscore">{headline.left}</b>
          </div>
        </div>
      ) : (
        waiting && (
          <p className="msg" role="status">
            Getting the score…
          </p>
        )
      )}
    </section>
  );
}
