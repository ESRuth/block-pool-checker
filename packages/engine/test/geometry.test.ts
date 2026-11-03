import { describe, expect, it } from "vitest";
import { apply, cellQuad, gridExtent, gridTransform, homography, invert, pointToCell, type Quad } from "../src/index.js";

const square: Quad = [
  [100, 100],
  [1100, 100],
  [1100, 1100],
  [100, 1100],
];
// A skewed, perspective-distorted photo of the grid (right side farther away).
const skew: Quad = [
  [120, 90],
  [1000, 160],
  [960, 900],
  [100, 1000],
];
const close = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)));

describe("homography", () => {
  it("maps the four source points onto the destination and inverts", () => {
    const h = homography(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      skew,
    );
    skew.forEach((d, i) =>
      close(
        apply(
          h,
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ][i] as [number, number],
        ),
        d,
        1e-4,
      ),
    );
    close(apply(invert(h), skew[2]), [10, 10], 1e-4);
  });
  it("rejects a degenerate quad", () => {
    expect(() =>
      homography(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ),
    ).toThrow();
  });
});

describe("cells", () => {
  it("axis-aligned grid: squares are 100px", () => {
    const q = cellQuad(square, 1, 1);
    close(q[0], [100, 100]);
    close(q[2], [200, 200]);
    close(cellQuad(square, 10, 10)[2], [1100, 1100]);
    close(cellQuad(square, 3, 5)[0], [500, 300]); // row 3 col 5: x = 100 + 4*100, y = 100 + 2*100
  });
  it("neighbouring cells share edges, also under perspective", () => {
    for (const g of [square, skew]) {
      close(cellQuad(g, 4, 6)[1], cellQuad(g, 4, 7)[0], 1e-6);
      close(cellQuad(g, 4, 6)[3], cellQuad(g, 5, 6)[0], 1e-6);
      close(cellQuad(g, 1, 1)[0], g[0], 1e-6);
      close(cellQuad(g, 10, 10)[2], g[2], 1e-6);
    }
  });
  it("pointToCell round-trips cell centres and returns null outside", () => {
    for (const g of [square, skew]) {
      for (const [r, c] of [
        [1, 1],
        [10, 10],
        [7, 3],
        [2, 9],
      ] as const) {
        const q = cellQuad(g, r, c);
        const centre: [number, number] = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
        expect(pointToCell(g, centre)).toEqual({ row: r, col: c });
      }
      expect(pointToCell(g, [5, 5])).toBeNull();
    }
  });
  it("rejects out-of-range rows and columns", () => {
    expect(() => cellQuad(square, 0, 1)).toThrow();
    expect(() => cellQuad(square, 1, 11)).toThrow();
  });
  it("perspective: far-side squares are smaller", () => {
    const near = cellQuad(skew, 5, 1),
      far = cellQuad(skew, 5, 10);
    expect(Math.hypot(near[1][0] - near[0][0], near[1][1] - near[0][1])).toBeGreaterThan(Math.hypot(far[1][0] - far[0][0], far[1][1] - far[0][1]));
    expect(gridTransform(skew).toGrid).toBeDefined();
  });
});

describe("gridExtent", () => {
  it("a grid inside the photo is complete", () => {
    expect(gridExtent(square, 1200, 1200)).toEqual({ incomplete: false, sides: [], cellsOutside: [] });
  });
  it("detects a grid cut off on the right, and which squares are affected", () => {
    const cut: Quad = [
      [100, 100],
      [1300, 100],
      [1300, 1100],
      [100, 1100],
    ]; // 120px squares, right edge at 1300 but photo is 1000 wide
    const e = gridExtent(cut, 1000, 1200);
    expect(e.incomplete).toBe(true);
    expect(e.sides).toEqual(["right"]);
    expect(e.cellsOutside.every((c) => c.col >= 8)).toBe(true);
    expect(e.cellsOutside.some((c) => c.col === 10)).toBe(true);
  });
  it("tolerates a small overhang (< 0.15 square)", () => {
    expect(gridExtent(square, 1105, 1105).incomplete).toBe(false);
    expect(gridExtent(square, 1050, 1200).incomplete).toBe(true);
  });
});
