import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { gridExtent, type Quad } from "@bpc/engine";
import { rgbaToGray, snapGrid } from "../src/index.js";

interface Ref {
  photo: string;
  width: number;
  height: number;
  start: number[][];
  truth: number[][];
  evidence: number;
}
const refs = JSON.parse(readFileSync(new URL("./fixtures/parity.json", import.meta.url), "utf8")) as Record<string, Ref>;

const load = (file: string) => {
  const raw = jpeg.decode(readFileSync(new URL(`../../../samples/${file}`, import.meta.url)), { useTArray: true, formatAsRGBA: true });
  return rgbaToGray(raw.data, raw.width, raw.height);
};
const blockOf = (q: number[][]) => (Math.hypot(q[1]![0]! - q[0]![0]!, q[1]![1]! - q[0]![1]!) + Math.hypot(q[2]![0]! - q[3]![0]!, q[2]![1]! - q[3]![1]!)) / 20;
const meanDist = (a: number[][], b: readonly (readonly number[])[]) => a.reduce((s, p, i) => s + Math.hypot(p[0]! - b[i]![0]!, p[1]! - b[i]![1]!), 0) / 4;

describe("snapGrid vs the known grid corners of each sample photo", () => {
  for (const [name, ref] of Object.entries(refs)) {
    it(`${name}: lands within 0.15 block of the true corners`, () => {
      const img = load(ref.photo);
      expect([img.width, img.height]).toEqual([ref.width, ref.height]);
      const t0 = performance.now();
      const r = snapGrid(img, ref.start as unknown as Quad);
      const ms = performance.now() - t0;
      const d = meanDist(r.corners as unknown as number[][], ref.truth) / blockOf(ref.truth);
      console.log(
        `${name}: ${d.toFixed(3)} sq from reference, moved ${r.movedBlocks.toFixed(2)} sq, evidence ${r.evidence.toFixed(1)} (measured when the photo was made: ${ref.evidence.toFixed(1)}), ${ms.toFixed(0)} ms`,
      );
      expect(d).toBeLessThan(0.15);
      expect(r.evidence).toBeGreaterThan(ref.evidence * 0.7);
      expect(r.movedBlocks).toBeLessThan(1);
    }, 60_000);
  }
});

describe("incomplete-grid detection on real photos", () => {
  it("flags the cropped Patriots photo and no other", () => {
    const flags: Record<string, boolean> = {};
    for (const [name, ref] of Object.entries(refs)) {
      const r = snapGrid(load(ref.photo), ref.start as unknown as Quad);
      flags[name] = gridExtent(r.corners, ref.width, ref.height).incomplete;
    }
    expect(flags).toEqual({ eagles_chargers: false, eagles_chiefs: false, eagles_commanders: false, patriots_rams: true });
  }, 120_000);
});

describe("what snapping can and cannot fix (synthetic displacements of the reference guess)", () => {
  const photos = ["eagles_chargers", "eagles_chiefs", "eagles_commanders"] as const;
  const shift = (dx: number, dy: number) => (c: number) => (p: number[]) => [p[0]! + dx * c, p[1]! + dy * c];
  it("recovers sideways shifts and size errors up to ~0.4 block in nearly every case", () => {
    let ok = 0,
      total = 0;
    for (const name of photos) {
      const ref = refs[name]!,
        img = load(ref.photo),
        c = blockOf(ref.truth);
      const cx = ref.start.reduce((s, p) => s + p[0]!, 0) / 4,
        cy = ref.start.reduce((s, p) => s + p[1]!, 0) / 4;
      const scale = (k: number) => () => (p: number[]) => [cx + (p[0]! - cx) * k, cy + (p[1]! - cy) * k];
      for (const f of [shift(0.3, 0.3), shift(-0.4, 0.2), scale(0.97), scale(1.03)]) {
        const start = ref.start.map(f(c)) as unknown as Quad;
        const d = meanDist(snapGrid(img, start).corners as unknown as number[][], ref.truth) / c;
        total++;
        if (d < 0.1) ok++;
      }
    }
    console.log(`recovered ${ok}/${total}`);
    // Known: one case (Commanders, shift +0.3,+0.3) locks onto a wrong alignment with the same evidence score as a good fit,
    // so a wrong snap cannot be detected from the score. The marked photo and drag-to-adjust are the safety net.
    expect(ok).toBeGreaterThanOrEqual(11);
  }, 120_000);

  // KNOWN LIMITATION: the fit has only translation + spacing per axis, so a guess whose corners are each off in a different
  // direction (shear/perspective error) is not corrected. `it.fails` flips to a failure if this ever starts working.
  it.fails(
    "does NOT correct per-corner errors of ~0.3 block",
    () => {
      const ref = refs["eagles_chargers"]!,
        c = blockOf(ref.truth);
      const off: Array<[number, number]> = [
        [0.3, 0.2],
        [-0.25, 0.3],
        [0.2, -0.3],
        [-0.3, -0.2],
      ];
      const start = ref.start.map((p, i) => [p[0]! + off[i]![0] * c, p[1]! + off[i]![1] * c]) as unknown as Quad;
      expect(meanDist(snapGrid(load(ref.photo), start).corners as unknown as number[][], ref.truth) / c).toBeLessThan(0.15);
    },
    60_000,
  );
});
