import { describe, expect, it } from "vitest";
import { ReadResultSchema } from "@bpc/engine";
import { badRows, cleanRow, rowProblem, rowsFromRead, setsFor } from "../src/lib/digits.js";

describe("rowProblem", () => {
  it("accepts a permutation", () => expect(rowProblem("9372806154")).toBeNull());
  it("hard stop reasons", () => {
    expect(rowProblem("937280615")).toMatch(/needs 10/);
    expect(rowProblem("93728?6154")).toMatch(/could not be read/);
    expect(rowProblem("9372806159")).toMatch(/repeated/);
    expect(rowProblem("93728a6154")).toMatch(/digits only/);
    expect(rowProblem("")).toMatch(/needs 10/);
  });
});

describe("rows", () => {
  const id = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const base = {
    top_team: null,
    left_team: null,
    grid_corners: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    grid_complete: true,
    uncertain: [],
  };
  it("shared sheet has 2 rows, per-period has 8; unreadable digits become '?'", () => {
    const shared = ReadResultSchema.parse({ ...base, digit_sets: "shared", top: { shared: id }, left: { shared: [...id.slice(0, 4), null, ...id.slice(5)] } });
    expect(setsFor("shared")).toEqual(["shared"]);
    expect(rowsFromRead(shared)).toEqual({ "shared.top": "0123456789", "shared.left": "0123?56789" });
    const per = ReadResultSchema.parse({
      ...base,
      digit_sets: "per_period",
      top: { Q1: id, Half: id, Q3: id, Final: id },
      left: { Q1: id, Half: id, Q3: id, Final: id },
    });
    expect(Object.keys(rowsFromRead(per))).toHaveLength(8);
    expect(badRows(rowsFromRead(per))).toEqual([]);
    expect(badRows(rowsFromRead(shared)).map((b) => b.key)).toEqual(["shared.left"]);
  });
  it("cleanRow keeps digits and '?', max 10", () => {
    expect(cleanRow("93 72-80?6154999")).toBe("937280?615");
  });
});
