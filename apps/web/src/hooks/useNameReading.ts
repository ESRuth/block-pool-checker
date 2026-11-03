import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { cornerShift } from "../lib/grid";
import { readNames } from "../lib/readApi";
import { gridImage } from "../lib/rows";
import type { Sheet } from "../lib/sheetApi";
import type { SheetEdit } from "./useSheetDoc";

const MAX_READ_TRIES = 3;

/**
 * Reads the names of the whole grid in ONE call. A name a person typed or confirmed is never replaced.
 * It reads on its own once the sheet is open for editing and has no names; `gridMoved` says a fresh read is worth offering.
 */
export function useNameReading(opts: {
  sheet: Sheet | null | undefined;
  latest: MutableRefObject<Sheet | null>;
  canEdit: boolean;
  img: HTMLImageElement | null;
  edit: SheetEdit;
}) {
  const { sheet, latest, canEdit, img, edit } = opts;
  const [reading, setReading] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const tries = useRef(0);

  /** `replaceUnconfirmed` (after the grid moved) swaps every name nobody has confirmed; otherwise only empty slots are filled. */
  async function readAll(replaceUnconfirmed: boolean, onlyCell?: string) {
    const s = latest.current;
    if (!s || !img || inFlight.current) return false;
    inFlight.current = true;
    setReading(true);
    try {
      const grid = await readNames(await gridImage(img, s.corners));
      edit((cur) => {
        const names = { ...cur.names };
        grid.forEach((row, r) =>
          row.forEach((text, c) => {
            const k = `${r + 1},${c + 1}`;
            if (onlyCell && k !== onlyCell) return;
            const old = names[k];
            if (!old || (replaceUnconfirmed && !old.confirmed) || (onlyCell && text !== null)) names[k] = { text: text ?? "", confirmed: false };
          }),
        );
        return { ...cur, names, namesCorners: onlyCell ? cur.namesCorners : s.corners };
      });
      return true;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
      setReading(false);
    }
  }
  const rereadSquare = async (k: string) => {
    setRereading(true);
    await readAll(false, k);
    setRereading(false);
  };

  // The grid was checked before the sheet was saved, so names are read as soon as the sheet opens for editing. Failures retry a few times.
  const missing = !!sheet && Object.keys(sheet.names).length < 100;
  useEffect(() => {
    if (!canEdit || !img || !missing || tries.current >= MAX_READ_TRIES) return;
    const t = setTimeout(async () => {
      tries.current += 1;
      if (!(await readAll(false))) setTimeout(() => setRetry((r) => r + 1), 15000);
    }, 600);
    return () => clearTimeout(t);
    // Re-run only when the situation changes (names missing, photo ready, a retry tick), not when `readAll` is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, img, retry, canEdit]);

  // If the grid moved after the names were read, they may belong to other squares.
  const gridMoved = !!sheet?.namesCorners && canEdit && cornerShift(sheet.corners, sheet.namesCorners) > 0.3;

  return { reading, rereading, missing, gridMoved, readAll, rereadSquare };
}
