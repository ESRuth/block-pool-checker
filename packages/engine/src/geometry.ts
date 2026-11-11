/** Perspective geometry for a photographed 10x10 grid. Pure math, no image access. */

export type Pt = readonly [number, number];
export type Quad = readonly [Pt, Pt, Pt, Pt]; // TL, TR, BR, BL
/** Row-major 3x3 projective transform. */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

/** Solve H such that H*src[i] = dst[i] (projectively) for four point pairs. */
export function homography(src: Quad, dst: Quad): Matrix3 {
  // 8 unknowns (h33 = 1): for each pair, two linear equations.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) throw new RangeError("degenerate quad");
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  const h = A.map((row, i) => row[8]! / row[i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invert(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) throw new RangeError("singular matrix");
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function apply(m: Matrix3, [x, y]: Pt): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/** Grid of 10x10 blocks as a mapping between unit-block grid coordinates (0..10 each way) and photo pixels. */
export function gridTransform(corners: Quad) {
  const toPhoto = homography(
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    corners,
  );
  const toGrid = invert(toPhoto);
  return { toPhoto, toGrid };
}

/** The four photo-pixel corners of a block. Rows and columns are 1-based. */
export function blockQuad(corners: Quad, row: number, col: number): Quad {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || row > 10 || col < 1 || col > 10) throw new RangeError("row/col must be 1-10");
  const { toPhoto } = gridTransform(corners);
  const c = col - 1,
    r = row - 1;
  return [apply(toPhoto, [c, r]), apply(toPhoto, [c + 1, r]), apply(toPhoto, [c + 1, r + 1]), apply(toPhoto, [c, r + 1])];
}

/** Which block (1-based) a photo pixel falls in, or null if outside the grid. */
export function pointToBlock(corners: Quad, p: Pt): { row: number; col: number } | null {
  const [gx, gy] = apply(gridTransform(corners).toGrid, p);
  if (gx < 0 || gy < 0 || gx >= 10 || gy >= 10) return null;
  return { row: Math.floor(gy) + 1, col: Math.floor(gx) + 1 };
}

export interface GridExtent {
  /** True when any part of the grid lies outside the photo (beyond `tolerance` blocks): winners there cannot be marked. */
  incomplete: boolean;
  /** Which edges the grid crosses. */
  sides: Array<"left" | "right" | "top" | "bottom">;
  /** Blocks (1-based) that lie fully or partly outside the photo. */
  blocksOutside: Array<{ row: number; col: number }>;
}

/** Check a grid against the photo bounds. Deliberately geometric: a vision model's own "grid_complete" flag proved unreliable. */
export function gridExtent(corners: Quad, width: number, height: number, tolerance = 0.15): GridExtent {
  const tol = tolerance;
  const outside = ([x, y]: Pt, cw: number, ch: number) => ({ l: x < -tol * cw, r: x > width + tol * cw, t: y < -tol * ch, b: y > height + tol * ch });
  const cw = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) / 10;
  const ch = Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]) / 10;
  const sides = new Set<"left" | "right" | "top" | "bottom">();
  const blocksOutside: Array<{ row: number; col: number }> = [];
  for (let row = 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      let any = false;
      for (const pt of blockQuad(corners, row, col)) {
        const o = outside(pt, cw, ch);
        if (o.l) {
          sides.add("left");
          any = true;
        }
        if (o.r) {
          sides.add("right");
          any = true;
        }
        if (o.t) {
          sides.add("top");
          any = true;
        }
        if (o.b) {
          sides.add("bottom");
          any = true;
        }
      }
      if (any) blocksOutside.push({ row, col });
    }
  }
  return { incomplete: blocksOutside.length > 0, sides: [...sides], blocksOutside };
}
