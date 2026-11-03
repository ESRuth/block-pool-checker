import { describe, expect, it } from "vitest";
import type { Quad } from "@bpc/engine";
import { cornerShift, outsideCorners, repairCorners } from "../src/lib/grid";

const q = (a: number[][]) => a as any;
describe("grid repair", () => {
  const good = q([
    [100, 100],
    [900, 100],
    [900, 700],
    [100, 700],
  ]);
  it("finds corners that are well outside the photo, and leaves a good grid alone", () => {
    expect(outsideCorners(good, 1000, 800)).toEqual([]);
    expect(
      outsideCorners(
        q([
          [100, 100],
          [900, 100],
          [900, 700],
          [-900, 2500],
        ]),
        1000,
        800,
      ),
    ).toEqual([3]);
    expect(
      outsideCorners(
        q([
          [100, 100],
          [900, 100],
          [900, 700],
          [-20, 790],
        ]),
        1000,
        800,
      ),
    ).toEqual([]); // slightly over the edge is fine
    expect(repairCorners(good, 1000, 800)).toBe(good);
  });
  it("one lost corner is rebuilt from the other three", () => {
    const lost = q([
      [100, 100],
      [900, 100],
      [900, 700],
      [-900, 2500],
    ]);
    expect(repairCorners(lost, 1000, 800)).toEqual([
      [100, 100],
      [900, 100],
      [900, 700],
      [100, 700],
    ]);
  });
  it("several lost corners fall back to an inset rectangle", () => {
    expect(
      repairCorners(
        q([
          [-900, 100],
          [900, 100],
          [900, 700],
          [-900, 2500],
        ]),
        1000,
        800,
      ),
    ).toEqual([
      [100, 80],
      [900, 80],
      [900, 720],
      [100, 720],
    ]);
  });
});

describe("cornerShift", () => {
  const q: Quad = [
    [100, 100],
    [1100, 100],
    [1100, 900],
    [100, 900],
  ]; // a square is 100 px wide
  it("is zero for the same grid and counts the biggest corner move in square widths", () => {
    expect(cornerShift(q, q)).toBe(0);
    expect(
      cornerShift(q, [
        [100, 100],
        [1100, 100],
        [1100, 900],
        [150, 900],
      ]),
    ).toBeCloseTo(0.5);
    expect(
      cornerShift(q, [
        [130, 140],
        [1100, 100],
        [1100, 900],
        [100, 900],
      ]),
    ).toBeCloseTo(0.5);
  });
});
