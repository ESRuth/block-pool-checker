import { useEffect, useRef, useState } from "react";
import type { Quad } from "@bpc/engine";
import { blockCanvas } from "../../lib/rows";
import type { NameEntry } from "../../lib/sheetApi";

interface Props {
  block: string;
  img: HTMLImageElement | null;
  corners: Quad;
  entry: NameEntry | undefined;
  mine: boolean;
  canEdit: boolean;
  /** Other blocks whose name currently reads exactly this text (offered the same fix). */
  findSame: (text: string) => string[];
  rereading: boolean;
  onName: (text: string) => void;
  onNameMany: (blocks: string[], text: string) => void;
  onToggleMine: () => void;
  onReread: () => void;
  onClose: () => void;
}

/** Close-up of one block with its name: fix it, clear it, mark it as yours, or read it again. */
export function BlockPanel({ block, img, corners, entry, mine, canEdit, findSame, rereading, onName, onNameMany, onToggleMine, onReread, onClose }: Props) {
  const [row, col] = block.split(",").map(Number) as [number, number];
  const holder = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(entry?.text ?? "");
  const [oldText, setOldText] = useState<string | null>(null);

  // A different block resets the box; a changed reading (a re-read, or the same fix applied elsewhere) refreshes it.
  useEffect(() => {
    setOldText(null);
  }, [block]);
  useEffect(() => {
    setText(entry?.text ?? "");
  }, [block, entry?.text]);
  useEffect(() => {
    const el = holder.current;
    if (!el || !img) return;
    el.replaceChildren(blockCanvas(img, corners, row, col));
  }, [img, corners, row, col]);

  const commit = (t: string) => {
    if (t === (entry?.text ?? "")) return;
    if (oldText === null && entry?.text) setOldText(entry.text);
    onName(t);
  };
  const others = oldText && text.trim() && oldText.trim().toLowerCase() !== text.trim().toLowerCase() ? findSame(oldText).filter((k) => k !== block) : [];

  return (
    <aside className="panel" role="dialog" aria-label="Block details">
      <div ref={holder} />
      <input
        value={text}
        readOnly={!canEdit}
        autoComplete="off"
        aria-label="Name in this block"
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
          Also change {others.length} other block{others.length === 1 ? "" : "s"} that read “{oldText}” to “{text.trim()}”
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
