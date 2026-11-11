import { useEffect, useState } from "react";
import { gameWhen, sheetName } from "../../lib/report";
import { mySheets, type SheetSummary } from "../../lib/sheetApi";

/** Owner only: every sheet on every venue, deleted ones last and marked (they can be restored or erased from their own page). */
export function AllSheets() {
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  useEffect(() => {
    mySheets()
      .then((l) => setSheets([...l.filter((x) => !x.deletedAt), ...l.filter((x) => x.deletedAt)]))
      .catch(() => setSheets([]));
  }, []);
  return (
    <main>
      <header className="top">
        <h1>Sheets</h1>
      </header>
      {sheets === null && (
        <p className="msg" role="status">
          Loading…
        </p>
      )}
      {sheets?.length === 0 && <p className="sub">No sheets yet. Sheets are made on a venue and removed 7 days after the game.</p>}
      <div className="sheetlist">
        {sheets?.map((s) => (
          <a key={s.id} className={s.deletedAt ? "card sheetcard gone" : "card sheetcard"} href={`/s/${s.id}`}>
            {(s.deletedAt || s.posted || s.draft) && (
              <span className="statusline">
                {s.deletedAt ? (
                  <span className="tag">Deleted</span>
                ) : s.posted ? (
                  <span className="tag">Open for blocks</span>
                ) : (
                  <span className="tag">Draft</span>
                )}
              </span>
            )}
            <b>{sheetName(s.teams.top, s.teams.left, s.tag)}</b>
            <span className="sub">
              {s.deletedAt && s.goneOn ? `Gone for good ${new Date(s.goneOn).toLocaleDateString()} · ` : ""}
              {gameWhen(s.kickoff)}
              {s.createdBy ? ` · Added by ${s.createdBy}` : ""}
            </span>
            <span className="go" aria-hidden="true">
              ›
            </span>
          </a>
        ))}
      </div>
    </main>
  );
}
