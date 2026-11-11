import { apply, invert, type Pt, type Quad } from "@bpc/engine";
import { boxBlur, gaussianBlur, warpQuad, type Gray } from "./image.js";

/** Keep only runs of set pixels at least `minLen` long (equivalent to a morphological opening with a line segment). */
function keepLongRuns(mask: Uint8Array, W: number, H: number, minLen: number, vertical: boolean): void {
  const outer = vertical ? W : H,
    inner = vertical ? H : W,
    stride = vertical ? W : 1,
    step = vertical ? 1 : W;
  for (let o = 0; o < outer; o++) {
    const base = o * step;
    let runStart = -1;
    for (let i = 0; i <= inner; i++) {
      const on = i < inner && mask[base + i * stride] === 1;
      if (on && runStart < 0) runStart = i;
      if (!on && runStart >= 0) {
        if (i - runStart < minLen) for (let j = runStart; j < i; j++) mask[base + j * stride] = 0;
        runStart = -1;
      }
    }
  }
}

/** Long dark strokes (printed/ruled lines), as row and column evidence profiles. */
function strokeProfiles(warp: Gray): { rows: Float32Array; cols: Float32Array } {
  const { width: W, height: H, data } = warp;
  const fine = gaussianBlur(warp, 1.2);
  const local = boxBlur(warp, 12, 3);
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < dark.length; i++) dark[i] = local[i]! - fine[i]! > 14 ? 1 : 0; // darker than the surroundings
  void data;
  const horiz = Uint8Array.from(dark),
    vert = Uint8Array.from(dark);
  keepLongRuns(horiz, W, H, Math.max(15, Math.floor(W / 14)), false);
  keepLongRuns(vert, W, H, Math.max(15, Math.floor(H / 14)), true);
  const rows = new Float32Array(H),
    cols = new Float32Array(W);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      rows[y]! += horiz[y * W + x]!;
      cols[x]! += vert[y * W + x]!;
    }
  return { rows, cols };
}

/** Best (start, step) so that 11 equally spaced lines sit on peaks of the profile. */
function fitLines(profile: Float32Array, nominalStart: number, nominalStep: number, startRange: number, stepFrac: number) {
  const n = profile.length;
  const p = new Float32Array(n); // 5-tap moving average, zero padded (same as a 'same' convolution)
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let k = -2; k <= 2; k++) a += profile[i + k] ?? 0;
    p[i] = a / 5;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += p[i]!;
  mean /= n;
  let best = { score: -1, start: nominalStart, step: nominalStep };
  for (let step = nominalStep * (1 - stepFrac); step <= nominalStep * (1 + stepFrac) + 1e-9; step += 0.5) {
    for (let start = nominalStart - startRange; start <= nominalStart + startRange + 1e-9; start += 1) {
      if (start < 0 || start + 10 * step > n - 1) continue;
      let s = 0;
      for (let i = 0; i < 11; i++) s += p[Math.round(start + step * i)]!;
      if (s > best.score) best = { score: s, start, step };
    }
  }
  return { start: best.start, step: best.step, evidence: best.score / Math.max(mean * 11, 1e-9) };
}

/**
 * One pass. `margin` is how much surrounding photo to keep for context; `reach` is how far (in blocks) the lines may move.
 * Reach must stay below half a block: the grid repeats every block and the digit-label bands share its spacing,
 * so a wider search can lock onto the neighbouring alignment (it can land a whole block off).
 */
function snapOnce(img: Gray, quad: Quad, margin: number, reach: number, stepFrac: number): { quad: Quad; evidence: number } {
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const Wq = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const Hq = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const Wt = 1000,
    Ht = Math.round((1000 * Hq) / Wq);
  const mx = Math.floor(Wt * margin),
    my = Math.floor(Ht * margin);
  const { gray, M } = warpQuad(img, quad, Wt, Ht, mx, my);
  const { rows, cols } = strokeProfiles(gray);
  const fy = fitLines(rows, my, Ht / 10, Math.round((reach * Ht) / 10), stepFrac);
  const fx = fitLines(cols, mx, Wt / 10, Math.round((reach * Wt) / 10), stepFrac);
  const inv = invert(M);
  const rect: Quad = [
    [fx.start, fy.start],
    [fx.start + 10 * fx.step, fy.start],
    [fx.start + 10 * fx.step, fy.start + 10 * fy.step],
    [fx.start, fy.start + 10 * fy.step],
  ];
  return { quad: rect.map((p) => apply(inv, p)) as unknown as Quad, evidence: (fx.evidence + fy.evidence) / 2 };
}

export interface SnapResult {
  corners: Quad;
  /** How strongly the fitted lines stand out from the rest of the photo (about 5-10 on good fits). */
  evidence: number;
  /** How far the corners moved from the starting guess, in blocks. Large moves mean the guess was poor. */
  movedBlocks: number;
}

/**
 * Snap a rough guess of the grid's four outer corners (photo pixels, TL TR BR BL) onto the printed grid lines.
 * Works when the guess is within about a block; it cannot rescue a guess that includes the digit-label bands.
 */
export function snapGrid(img: Gray, start: Quad): SnapResult {
  let quad = start;
  let evidence = 0;
  for (const [margin, reach, stepFrac] of [
    [0.08, 0.45, 0.06],
    [0.05, 0.1, 0.03],
    [0.03, 0.05, 0.02],
  ] as const)
    ({ quad, evidence } = snapOnce(img, quad, margin, reach, stepFrac));
  const block = (Math.hypot(start[1][0] - start[0][0], start[1][1] - start[0][1]) + Math.hypot(start[2][0] - start[3][0], start[2][1] - start[3][1])) / 20;
  const moved = quad.reduce((s, p, i) => s + Math.hypot(p[0] - start[i]![0], p[1] - start[i]![1]), 0) / 4 / block;
  return { corners: quad, evidence, movedBlocks: moved };
}
