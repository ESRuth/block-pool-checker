import { useState } from "react";
import type { Quad } from "@bpc/engine";
import { snapGrid, type Gray } from "@bpc/vision";
import { GridOverlay } from "../../components/GridOverlay";
import type { Box } from "../../lib/boxes";
import type { Highlight } from "../../hooks/useSquares";
import type { useGridHistory } from "../../hooks/useGridHistory";

interface Props {
  url: string;
  width: number;
  height: number;
  corners: Quad;
  canEdit: boolean;
  /** Whether the grid lines and corner handles are drawn (editors only). */
  adjust: boolean;
  onToggleGrid: () => void;
  gray: Gray | null;
  history: ReturnType<typeof useGridHistory>;
  onCorners: (c: Quad) => void;
  boxes: Box[];
  highlights: Highlight[];
  onTap: (p: [number, number]) => void;
  incomplete: boolean;
}

/** The photo with the winners boxed, plus the grid tools (show/hide, snap, undo, zoom). */
export function PhotoCard(p: Props) {
  const [zoom, setZoom] = useState(false);
  const grid = p.adjust && p.canEdit;
  return (
    <section className="sec photosec" aria-label="Your sheet">
      <div className={zoom ? "zoomwrap on" : "zoomwrap"}>
        <GridOverlay
          url={p.url}
          width={p.width}
          height={p.height}
          corners={p.corners}
          onChange={p.onCorners}
          onDragStart={() => p.history.push(p.corners)}
          markers={p.boxes}
          highlights={p.highlights}
          onTap={p.onTap}
          showGrid={grid}
          handles={grid}
        />
      </div>
      <div className="actions">
        <button onClick={() => setZoom(!zoom)}>{zoom ? "Zoom out" : "Zoom in"}</button>
        {p.canEdit && (
          <button onClick={p.onToggleGrid} aria-pressed={p.adjust}>
            {p.adjust ? "Hide grid" : "Show grid"}
          </button>
        )}
        {grid && (
          <button
            disabled={!p.gray}
            onClick={() => {
              if (!p.gray) return;
              p.history.push(p.corners);
              p.onCorners(snapGrid(p.gray, p.corners).corners);
            }}
          >
            Snap to lines
          </button>
        )}
        {grid && p.history.count > 0 && <button onClick={p.history.undo}>Undo</button>}
      </div>
      {grid && <p className="sub">Drag the circles onto the four corners of the grid.</p>}
      {p.incomplete && (
        <p className="warn" role="alert">
          Part of the sheet is cut off in this photo, so some winners may not be boxed. Retake it with the whole sheet in view.
        </p>
      )}
    </section>
  );
}
