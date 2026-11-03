import { useEffect, useRef, useState } from "react";
import type { Quad } from "@bpc/engine";
import { cellCanvas } from "../../lib/rows";
import type { NameEntry } from "../../lib/sheetApi";

interface Props {
  cell: string;
  img: HTMLImageElement | null;
  corners: Quad;
  entry: NameEntry | undefined;
  mine: boolean;
  canEdit: boolean;
  /** Other squares whose name currently reads exactly this text (offered the same fix). */
  findSame: (text: string) => string[];
  rereading: boolean;
  onName: (text: string) => void;
  onNameMany: (cells: string[], text: string) => void;
  onToggleMine: () => void;
  onReread: () => void;
  onClose: () => void;
}

/** Close-up of one square with its name: fix it, clear it, mark it as yours, or read it again. */
export function SquarePanel({ cell, img, corners, entry, mine, canEdit, findSame, rereading, onName, onNameMany, onToggleMine, onReread, onClose }: Props) {
  const [row, col] = cell.split(",").map(Number) as [number, number];
  const holder = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(entry?.text ?? "");
  const [oldText, setOldText] = useState<string | null>(null);

  // A different square resets the box; a changed reading (a re-read, or the same fix applied elsewhere) refreshes it.
  useEffect(() => {
    setOldText(null);
  }, [cell]);
  useEffect(() => {
    setText(entry?.text ?? "");
  }, [cell, entry?.text]);
  useEffect(() => {
    const el = holder.current;
    if (!el || !img) return;
    el.replaceChildren(cellCanvas(img, corners, row, col));
  }, [img, corners, row, col]);

  const commit = (t: string) => {
    if (t === (entry?.text ?? "")) return;
    if (oldText === null && entry?.text) setOldText(entry.text);
    onName(t);
  };
  const others = oldText && text.trim() && oldText.trim().toLowerCase() !== text.trim().toLowerCase() ? findSame(oldText).filter((k) => k !== cell) : [];

  return (
    <aside className="panel" role="dialog" aria-label="Square details">
      <div ref={holder} />
      <input
        value={text}
        readOnly={!canEdit}
        autoComplete="off"
        aria-label="Name in this square"
        placeholder={canEdit ? "type the name (leave empty if blank)" : "no name"}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClose();
        }}
      />
      {others.length > 0 && (
        <button
          className="wide"
          onClick={() => {
            onNameMany(others, text);
            setOldText(null);
          }}
        >
          Also change {others.length} other square{others.length === 1 ? "" : "s"} that read “{oldText}” to “{text.trim()}”
        </button>
      )}
      <div className="panelbtns">
        <button aria-pressed={mine} onClick={onToggleMine}>
          {mine ? "★ Mine" : "Mark mine"}
        </button>
        {canEdit && (
          <button onClick={onReread} disabled={rereading}>
            {rereading ? "Reading…" : "Read again"}
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => {
              setText("");
              commit("");
            }}
            disabled={!entry?.text}
          >
            Clear
          </button>
        )}
        <button className="primary done" onClick={onClose}>
          Done
        </button>
      </div>
      {entry && !entry.confirmed && entry.text.trim() && canEdit && <p className="hint">Read from the photo: check it against the picture.</p>}
    </aside>
  );
}
