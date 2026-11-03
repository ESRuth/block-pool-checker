import { useEffect, useState } from "react";
import { fetchGameSuggestions, recentGames, searchGames, type GameRef } from "../lib/gameApi";

const STATUS: Record<GameRef["status"], string> = { scheduled: "Upcoming", in_progress: "In progress", halftime: "Halftime", final: "Final" };
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function GamePicker({ top, left, onPick }: { top: string; left: string; onPick: (g: GameRef) => void }) {
  const [games, setGames] = useState<GameRef[] | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    setGames(null);
    fetchGameSuggestions(top, left)
      .then(async (g) => {
        if (!live) return;
        if (g.length) {
          setGames(g);
          setNote("");
          return;
        }
        setNote(`No games found for "${top}" / "${left}". Here are the latest games, or search below.`);
        setGames(await recentGames());
      })
      .catch(() => live && (setGames([]), setNote("Couldn't load games. Check your connection.")));
    return () => {
      live = false;
    };
  }, [top, left]);

  return (
    <div>
      {note && <p className="sub">{note}</p>}
      {games === null && (
        <p className="msg" role="status">
          Finding games…
        </p>
      )}
      <ul className="games">
        {games?.map((g) => (
          <li key={g.gameId}>
            <button onClick={() => onPick(g)}>
              <b>
                {g.away.abbr} @ {g.home.abbr}
              </b>
              <span>
                {g.away.nickname} at {g.home.nickname}
              </span>
              <small>
                {when(g.kickoff)} · {STATUS[g.status]}
                {g.label ? ` · ${g.label}` : ""}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim())
            searchGames(q.trim())
              .then(setGames)
              .catch(() => setNote("Search failed."));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a team" />
        <button disabled={!q.trim()}>Search</button>
      </form>
    </div>
  );
}
