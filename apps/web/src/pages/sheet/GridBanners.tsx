import type { Quad } from "@bpc/engine";
import { outsideCorners, repairCorners } from "../../lib/grid";
import type { useGridHistory } from "../../hooks/useGridHistory";

interface Props {
  corners: Quad;
  width: number;
  height: number;
  canEdit: boolean;
  history: ReturnType<typeof useGridHistory>;
  onCorners: (c: Quad) => void;
  /** Called after a repair so the grid is shown for checking. */
  onRepaired: () => void;
  gridMoved: boolean;
  readingNames: boolean;
  onReread: () => void;
}

/** Warnings about the grid: a corner lost off the photo, or the grid moved after the names were read. */
export function GridBanners(p: Props) {
  const lost = p.canEdit && outsideCorners(p.corners, p.width, p.height).length > 0;
  return (
    <>
      {lost && (
        <section className="warn" role="alert">
          <p>A corner of the grid is outside the photo, so the winners may be boxed in the wrong blocks.</p>
          <button
            onClick={() => {
              p.history.push(p.corners);
              p.onCorners(repairCorners(p.corners, p.width, p.height));
              p.onRepaired();
            }}
          >
            Fix the grid
          </button>
          <p className="sub">Then check the lines sit on the printed blocks, and drag a corner if they don't.</p>
        </section>
      )}
      {p.gridMoved && (
        <section className="warn" role="status">
          <p>You moved the grid after the names were read, so some names may belong to other blocks.</p>
          <button disabled={p.readingNames} onClick={p.onReread}>
            {p.readingNames ? "Reading…" : "Read the names again"}
          </button>
          <p className="sub">Names you've typed or confirmed stay as they are.</p>
        </section>
      )}
    </>
  );
}
