import type { Quad } from "@bpc/engine";

type P = [number, number];

/** True for a corner that is outside the photo by more than `margin` (a fraction of the photo's size). */
export function outsideCorners(corners: Quad, width: number, height: number, margin = 0.06): number[] {
  return corners.flatMap((c, i) =>
    c[0] < -margin * width || c[0] > (1 + margin) * width || c[1] < -margin * height || c[1] > (1 + margin) * height ? [i] : [],
  );
}

/**
 * Put a lost corner back. One corner outside: finish the parallelogram from the other three (a photo of a flat sheet is close to one).
 * More than one: fall back to a rectangle inset 10% from the photo's edges, which the person then adjusts.
 */
export function repairCorners(corners: Quad, width: number, height: number): Quad {
  const bad = outsideCorners(corners, width, height);
  if (bad.length === 0) return corners;
  if (bad.length === 1) {
    const i = bad[0]!;
    const a = corners[(i + 1) % 4]!,
      opp = corners[(i + 2) % 4]!,
      b = corners[(i + 3) % 4]!;
    const fixed: P = [a[0] + b[0] - opp[0], a[1] + b[1] - opp[1]];
    const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
    const next = corners.map((c) => [c[0], c[1]] as P);
    next[i] = [clamp(fixed[0], width), clamp(fixed[1], height)];
    return next as unknown as Quad;
  }
  const x0 = width * 0.1,
    x1 = width * 0.9,
    y0 = height * 0.1,
    y1 = height * 0.9;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as unknown as Quad;
}

/** Largest corner movement between two grids, in square widths. */
export function cornerShift(a: Quad, b: Quad): number {
  const cell = Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) / 10 || 1;
  return Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1]))) / cell;
}
