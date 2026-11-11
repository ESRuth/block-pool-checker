import type { ReportLine } from "../../lib/report";
import type { NameEntry } from "../../lib/sheetApi";

interface Props {
  lines: ReportLine[];
  /** Names cached per winning block. */
  names: Record<string, NameEntry>;
  /** Blocks whose name is being read right now. */
  reading: Set<string>;
  onName: (block: string, text: string) => void;
  onConfirm: (block: string) => void;
  /** A view-only link: names can be seen but not changed. */
  readOnly?: boolean;
  /** Blocks the person marked as theirs. */
  mine?: Set<string>;
}

/** The report under the photo: one coloured line per period, same colours as the boxes. */
export function Results({ lines, names, reading, onName, onConfirm, readOnly, mine }: Props) {
  return (
    <ol className="lines">
      {lines.map((l) => {
        const n = l.block ? names[l.block] : undefined;
        const yours = !!l.block && !!mine?.has(l.block);
        return (
          <li key={l.period} style={{ color: l.color, ...({ "--c": l.color } as object) }} className={l.dim ? "dim" : ""}>
            <span className="plabel" aria-label={`Period ${l.label}`}>
              {l.label}
            </span>
            <span className="pscore">{l.score}</span>
            {l.wantsName && l.block ? (
              <span className="pname">
                <input
                  value={n?.text ?? ""}
                  autoComplete="off"
                  aria-label={`Winner's name for period ${l.label}`}
                  readOnly={readOnly}
                  placeholder={reading.has(l.block) || !n ? "reading name…" : readOnly ? "no name yet" : "type the name"}
                  onChange={(e) => onName(l.block!, e.target.value)}
                />
                {!readOnly && n && !n.confirmed && n.text.trim() && (
                  <button className="qm" title="Read by the app. Tap if it's right." aria-label="Mark this name as right" onClick={() => onConfirm(l.block!)}>
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
