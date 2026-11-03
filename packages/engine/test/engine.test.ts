import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findNames, parsePool, payouts, playerSquares, winningCell, PERIODS } from "../src/index.js";

const raw = JSON.parse(readFileSync(new URL("../fixtures/eagles_commanders_2026.json", import.meta.url), "utf8"));
const pool = parsePool(raw);

describe("engine", () => {
  it("finds all four winners on the Eagles-Commanders fixture", () => {
    const cases = { Q1: [10, 3, 8, 6, "Ted Q"], Half: [10, 13, 7, 6, "BAKER"], Q3: [10, 16, 5, 8, "P.P."], Final: [10, 27, 3, 9, "Reed"] } as const;
    for (const p of PERIODS) {
      const [t, l, row, col, owner] = cases[p];
      const w = winningCell(pool, p, t, l);
      expect([w.row, w.col, w.owner]).toEqual([row, col, owner]);
    }
  });
  it("lists a player's score endings per period", () => {
    const [sq] = playerSquares(pool, ["dan mccoy "]);
    expect([sq!.row, sq!.col]).toEqual([9, 7]);
    expect(sq!.endings.Final).toEqual({ top: 2, left: 5 });
    expect(sq!.endings.Q1).toEqual({ top: 6, left: 0 });
  });
  it("rejects a duplicate digit", () => {
    const bad = structuredClone(raw);
    bad.digits.Q1.top[0] = 3;
    expect(() => parsePool(bad)).toThrow();
  });
  it("rejects identical teams and out-of-range owner keys", () => {
    expect(() => parsePool({ ...raw, left_team: "EAGLES" })).toThrow();
    expect(() => parsePool({ ...raw, owners: { "0,5": "x" } })).toThrow();
  });
  it("supports a shared digit set", () => {
    const id = Array.from({ length: 10 }, (_, i) => i);
    const p = parsePool({ schema_version: 1, top_team: "Patriots", left_team: "Rams", digits: { shared: { top: id, left: id } } });
    const w = winningCell(p, "Final", 13, 3);
    expect([w.row, w.col, w.owner]).toEqual([4, 4, "Unverified"]);
  });
  it("computes share and fixed payouts", () => {
    const r = payouts({ kind: "shares", pricePerSquare: 10, soldSquares: 100, shares: { Q1: 25, Half: 25, Q3: 25, Final: 25 } });
    expect(r.pot).toBe(1000);
    expect(r.amounts.Q1).toBe(250);
    expect(() => payouts({ kind: "shares", pricePerSquare: 10, soldSquares: 100, shares: { Q1: 30, Half: 25, Q3: 25, Final: 25 } })).toThrow();
    expect(payouts({ kind: "shares", pricePerSquare: 10, soldSquares: 50, shares: { Q1: 25, Half: 25, Q3: 25, Final: 25 } }).pot).toBe(500);
    expect(payouts({ kind: "fixed", amounts: { Q1: 50, Half: 100, Q3: 50, Final: 200 } }).pot).toBeNull();
  });
});

describe("full-board fixture", () => {
  it("has all 100 squares and finds Emil Rowe's four", () => {
    expect(Object.keys(pool.owners)).toHaveLength(100);
    expect(playerSquares(pool, ["Emil Rowe"]).map((s) => `${s.row},${s.col}`)).toEqual(["7,10", "8,10", "9,9", "10,7"]);
  });
});

describe("findNames", () => {
  const names = (q: string) => findNames(pool, q).map((m) => m.name);
  it("partial first name finds every name containing it", () => {
    expect(names("Emil")).toEqual(expect.arrayContaining(["Emil Rowe", "Ben + Emil"]));
    expect(names("emil")).toHaveLength(2);
    expect(findNames(pool, "emil").find((m) => m.name === "Emil Rowe")!.squares).toBe(4);
  });
  it("matches word prefixes, multiple words, and ignores case and punctuation", () => {
    expect(names("emi ro")).toEqual(["Emil Rowe"]);
    expect(names("rowe emil")).toEqual(["Emil Rowe"]);
    expect(names("+ emil")).toEqual(names("emil"));
  });
  it("falls back to substring matches, ranked after word-prefix matches", () => {
    expect(names("owe")).toEqual(["Emil Rowe"]);
    expect(names("mil")[0]).not.toBe(undefined);
  });
  it("never suggests Unverified, empty input, or unknown names", () => {
    expect(names("unver")).toEqual([]);
    expect(names("  ")).toEqual([]);
    expect(names("zzzz")).toEqual([]);
  });
  it("does not merge similar names", () => {
    const n = names("drew");
    expect(n).toEqual(expect.arrayContaining(["Drew P", "Dana + Drew P"]));
  });
});
