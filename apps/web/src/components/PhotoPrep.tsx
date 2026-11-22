import { useEffect, useRef, useState } from "react";
import { drawTurned, editPhoto, FULL_CROP, isUnedited, type LoadedPhoto, type PhotoEdit } from "../lib/photo";

/** The preview is drawn at this size at most; the real photo is only touched when the person taps Use this photo. */
const PREVIEW = 900;
/** A crop cannot get smaller than this fraction of the photo, so its handles can always be grabbed. */
const MIN = 0.15;

type Edge = "tl" | "tr" | "br" | "bl";
const LABEL: Record<Edge, string> = { tl: "top-left", tr: "top-right", br: "bottom-right", bl: "bottom-left" };

/**
 * The step between choosing a photo and using it: turn it in quarter turns and crop it. Nothing is read or uploaded until the person
 * taps Use this photo, so a sideways photo does not cost a read. The crop's four corners are buttons: drag them, or tab to one and use the arrow keys.
 */
export function PhotoPrep({ photo, onUse, onOther }: { photo: LoadedPhoto; onUse: (p: LoadedPhoto) => void; onOther: () => void }) {
  const [edit, setEdit] = useState<PhotoEdit>({ turns: 0, crop: FULL_CROP });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = photo.url;
  }, [photo.url]);
  useEffect(() => {
    if (img && canvas.current) drawTurned(canvas.current, img, photo.width, photo.height, edit.turns, PREVIEW);
  }, [img, edit.turns, photo.width, photo.height]);

  const turn = (d: 1 | -1) => setEdit((e) => ({ turns: (e.turns + d + 4) % 4, crop: FULL_CROP })); // a new turn starts the crop over
  const setEdge = (edge: Edge, x: number, y: number) =>
    setEdit((e) => {
      const c = { ...e.crop };
      if (edge === "tl" || edge === "bl") c.l = Math.min(Math.max(0, x), c.r - MIN);
      else c.r = Math.max(Math.min(1, x), c.l + MIN);
      if (edge === "tl" || edge === "tr") c.t = Math.min(Math.max(0, y), c.b - MIN);
      else c.b = Math.max(Math.min(1, y), c.t + MIN);
      return { ...e, crop: c };
    });
  const at = (edge: Edge) => ({ x: edge === "tl" || edge === "bl" ? edit.crop.l : edit.crop.r, y: edge === "tl" || edge === "tr" ? edit.crop.t : edit.crop.b });

  const drag = (edge: Edge) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = box.current!.getBoundingClientRect();
    setEdge(edge, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const key = (edge: Edge) => (e: React.KeyboardEvent) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.01;
    const p = at(edge);
    setEdge(edge, p.x + d[0]! * step, p.y + d[1]! * step);
  };

  async function use() {
    setBusy(true);
    try {
      onUse(await editPhoto(photo, edit));
    } catch {
      setBusy(false);
    }
  }
  const c = edit.crop;
  return (
    <section>
      <h2>Is the sheet the right way up?</h2>
      <p className="sub">Turn the photo if it is sideways. Drag the corners inward to cut away anything that is not the sheet. Everything is optional.</p>
      <div className="prepbox">
        <div className="prepinner" ref={box}>
          <canvas ref={canvas} role="img" aria-label="Your photo, as it will be used" />
          <div className="crop" style={{ left: `${c.l * 100}%`, top: `${c.t * 100}%`, width: `${(c.r - c.l) * 100}%`, height: `${(c.b - c.t) * 100}%` }} />
          {(["tl", "tr", "br", "bl"] as Edge[]).map((edge) => {
            const p = at(edge);
            return (
              <button
                key={edge}
                type="button"
                className="cropgrip"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                aria-label={`Crop: move the ${LABEL[edge]} corner (drag, or use the arrow keys)`}
                onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={drag(edge)}
                onKeyDown={key(edge)}
              />
            );
          })}
        </div>
      </div>
      <div className="actions">
        <button type="button" onClick={() => turn(-1)}>
          Turn left
        </button>
        <button type="button" onClick={() => turn(1)}>
          Turn right
        </button>
        <button type="button" disabled={c.l === 0 && c.t === 0 && c.r === 1 && c.b === 1} onClick={() => setEdit((e) => ({ ...e, crop: FULL_CROP }))}>
          Reset crop
        </button>
      </div>
      <button className="primary" disabled={busy || !img} onClick={use}>
        {isUnedited(edit) ? "Use this photo" : "Use this photo as shown"}
      </button>
      <button type="button" className="linkbtn" onClick={onOther}>
        Choose a different photo
      </button>
    </section>
  );
}
