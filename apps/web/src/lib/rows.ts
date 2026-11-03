import { apply, gridTransform, type Quad } from "@bpc/engine";

type P = [number, number];

/** Draw `src` triangle of the image onto the `dst` triangle (affine), clipped a hair wider so neighbouring triangles leave no seam. */
function triangle(ctx: CanvasRenderingContext2D, img: CanvasImageSource, s: [P, P, P], d: [P, P, P]) {
  // Solve for the affine map d = A*s + t from the three point pairs.
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-9) return;
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / det;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det;
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / det;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / det;
  const cx = (u0 + u1 + u2) / 3,
    cy = (v0 + v1 + v2) / 3;
  ctx.save();
  ctx.beginPath();
  d.forEach(([px, py], i) => {
    const k = 1 + 0.6 / Math.hypot(px - cx, py - cy);
    const qx = cx + (px - cx) * k,
      qy = cy + (py - cy) * k;
    if (i === 0) ctx.moveTo(qx, qy);
    else ctx.lineTo(qx, qy);
  });
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

const GW = 2400,
  GH = 1800; // measured: this size reads as well as larger ones

/** The whole 10x10 grid, straightened, as one image (base64 JPEG). One image per sheet: this is all the name reader needs. */
export async function gridImage(img: CanvasImageSource, corners: Quad): Promise<string> {
  const { toPhoto } = gridTransform(corners);
  const canvas = document.createElement("canvas");
  canvas.width = GW;
  canvas.height = GH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, GW, GH);
  const cw = GW / 10,
    ch = GH / 10;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const s = (
        [
          [c, r],
          [c + 1, r],
          [c + 1, r + 1],
          [c, r + 1],
        ] as P[]
      ).map((p) => apply(toPhoto, p) as P);
      const x0 = c * cw,
        y0 = r * ch,
        x1 = x0 + cw,
        y1 = y0 + ch;
      triangle(
        ctx,
        img,
        [s[0]!, s[1]!, s[2]!],
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
        ],
      );
      triangle(
        ctx,
        img,
        [s[0]!, s[2]!, s[3]!],
        [
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ],
      );
    }
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new Error("could not encode the grid");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A close-up of one square (1-based row/col), straightened, with a little of its neighbours around it. */
export function cellCanvas(img: CanvasImageSource, corners: Quad, row: number, col: number, w = 560, h = 380, pad = 0.12): HTMLCanvasElement {
  const { toPhoto } = gridTransform(corners);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const u0 = col - 1 - pad,
    u1 = col + pad,
    v0 = row - 1 - pad,
    v1 = row + pad;
  const s = (
    [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ] as P[]
  ).map((p) => apply(toPhoto, p) as P);
  triangle(
    ctx,
    img,
    [s[0]!, s[1]!, s[2]!],
    [
      [0, 0],
      [w, 0],
      [w, h],
    ],
  );
  triangle(
    ctx,
    img,
    [s[0]!, s[2]!, s[3]!],
    [
      [0, 0],
      [w, h],
      [0, h],
    ],
  );
  return canvas;
}
