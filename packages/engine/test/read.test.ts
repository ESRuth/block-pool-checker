import { describe, expect, it } from "vitest";
import { ReadResultSchema, readToDigits } from "../src/index.js";

const id = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const rot = (n: number) => id.map((d) => (d + n) % 10);
const base = {
  top_team: "Eagles",
  left_team: null,
  grid_complete: true,
  uncertain: [],
  grid_corners: [
    [100, 100],
    [900, 100],
    [900, 900],
    [100, 900],
  ],
};
const perPeriod = (over: Record<string, unknown> = {}) =>
  ReadResultSchema.parse({
    ...base,
    digit_sets: "per_period",
    top: { Q1: rot(1), Half: rot(2), Q3: rot(3), Final: rot(4) },
    left: { Q1: rot(5), Half: rot(6), Q3: rot(7), Final: rot(8) },
    ...over,
  });

describe("readToDigits", () => {
  it("accepts four clean permutations per axis", () => {
    const r = readToDigits(perPeriod());
    expect(r.problems).toEqual([]);
    expect(r.digits).toMatchObject({ Q1: { top: rot(1), left: rot(5) }, Final: { top: rot(4), left: rot(8) } });
  });
  it("accepts a shared set", () => {
    const r = readToDigits(ReadResultSchema.parse({ ...base, digit_sets: "shared", top: { shared: rot(3) }, left: { shared: rot(7) } }));
    expect(r.digits).toEqual({ shared: { top: rot(3), left: rot(7) } });
  });
  it("hard stop on a duplicate digit, naming the row and returning what was read", () => {
    const bad = [...rot(1)];
    bad[0] = bad[1]!;
    const r = readToDigits(perPeriod({ top: { Q1: bad, Half: rot(2), Q3: rot(3), Final: rot(4) } }));
    expect(r.digits).toBeNull();
    expect(r.problems).toEqual([{ set: "Q1", axis: "top", kind: "duplicate_digit", got: bad }]);
  });
  it("hard stop on an unreadable (null) digit rather than guessing it", () => {
    const hole = [...rot(1)] as Array<number | null>;
    hole[4] = null;
    const r = readToDigits(perPeriod({ left: { Q1: rot(5), Half: hole, Q3: rot(7), Final: rot(8) } }));
    expect(r.digits).toBeNull();
    expect(r.problems.map((p) => [p.set, p.axis, p.kind])).toEqual([["Half", "left", "unreadable_digit"]]);
  });
  it("reports wrong length and a missing set", () => {
    const r = readToDigits(perPeriod({ top: { Q1: rot(1).slice(0, 9), Half: rot(2), Q3: rot(3), Final: rot(4) } }));
    expect(r.problems[0]).toMatchObject({ set: "Q1", axis: "top", kind: "wrong_length" });
    // reader says per_period but returned a shared set
    const m = readToDigits(ReadResultSchema.parse({ ...base, digit_sets: "per_period", top: { shared: rot(1) }, left: { shared: rot(2) } }));
    expect(m.digits).toBeNull();
    expect(m.problems).toHaveLength(8);
    expect(m.problems.every((p) => p.kind === "missing_set")).toBe(true);
  });
  it("reports every bad row at once", () => {
    const r = readToDigits(
      perPeriod({
        top: { Q1: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], Half: rot(2), Q3: rot(3), Final: rot(4) },
        left: { Q1: rot(5), Half: rot(6), Q3: rot(7), Final: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9] },
      }),
    );
    expect(r.problems.map((p) => `${p.set}.${p.axis}`)).toEqual(["Q1.top", "Final.left"]);
  });
});

describe("ReadResultSchema", () => {
  it("rejects out-of-range digits and malformed corners", () => {
    expect(() => perPeriod({ top: { Q1: [...rot(1).slice(0, 9), 12], Half: rot(2), Q3: rot(3), Final: rot(4) } })).toThrow();
    expect(() => ReadResultSchema.parse({ ...base, digit_sets: "shared", top: { shared: id }, left: { shared: id }, grid_corners: [[1, 2]] })).toThrow();
  });
});
