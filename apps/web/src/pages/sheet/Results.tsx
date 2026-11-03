import type { ReportLine } from "../../lib/report";
import type { NameEntry } from "../../lib/sheetApi";

interface Props {
  lines: ReportLine[];
  /** Names cached per winning square. */
  names: Record<string, NameEntry>;
  /** Squares whose name is being read right now. */
  reading: Set<string>;
  onName: (cell: string, text: string) => void;
  onConfirm: (cell: string) => void;
  /** A view-only link: names can be seen but not changed. */
  readOnly?: boolean;
  /** Squares the person marked as theirs. */
  mine?: Set<string>;
}

/** The report under the photo: one coloured line per period, same colours as the boxes. */
export function Results({ lines, names, reading, onName, onConfirm, readOnly, mine }: Props) {
  return (
    <ol className="lines">
      {lines.map((l) => {
        const n = l.cell ? names[l.cell] : undefined;
        const yours = !!l.cell && !!mine?.has(l.cell);
        return (
          <li key={l.period} style={{ color: l.color, ...({ "--c": l.color } as object) }} className={l.dim ? "dim" : ""}>
            <span className="plabel" aria-label={`Period ${l.label}`}>
              {l.label}
            </span>
            <span className="pscore">{l.score}</span>
            {l.wantsName && l.cell ? (
              <span className="pname">
                <input
                  value={n?.text ?? ""}
                  autoComplete="off"
                  aria-label={`Winner's name for period ${l.label}`}
                  readOnly={readOnly}
                  placeholder={reading.has(l.cell) || !n ? "reading name…" : readOnly ? "no name yet" : "type the name"}
                  onChange={(e) => onName(l.cell!, e.target.value)}
                />
                {!readOnly && n && !n.confirmed && n.text.trim() && (
                  <button className="qm" title="Read by the app. Tap if it's right." aria-label="Mark this name as right" onClick={() => onConfirm(l.cell!)}>
                    ?
                  </button>
                )}
              </span>
            ) : (
              <span className="pname" />
            )}
            {(l.note || yours) && (
              <span className="pnote">
                {l.note}
                {l.note && yours ? ", " : ""}
                {yours && <b className="yours">★ yours</b>}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
