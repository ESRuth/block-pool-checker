import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePool, winningBlock, PERIODS } from "../src/index.js";

const raw = JSON.parse(readFileSync(new URL("../fixtures/eagles_commanders_2026.json", import.meta.url), "utf8"));
const pool = parsePool(raw);

describe("engine", () => {
  it("finds all four winners on the Eagles-Commanders fixture", () => {
    const cases = { Q1: [10, 3, 8, 6, "Ted Q"], Half: [10, 13, 7, 6, "BAKER"], Q3: [10, 16, 5, 8, "P.P."], Final: [10, 27, 3, 9, "Reed"] } as const;
    for (const p of PERIODS) {
      const [t, l, row, col, owner] = cases[p];
      const w = winningBlock(pool, p, t, l);
      expect([w.row, w.col, w.owner]).toEqual([row, col, owner]);
    }
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
    const w = winningBlock(p, "Final", 13, 3);
    expect([w.row, w.col, w.owner]).toEqual([4, 4, "Unverified"]);
  });
});

describe("full-sheet fixture", () => {
  it("has all 100 blocks", () => {
    expect(Object.keys(pool.owners)).toHaveLength(100);
  });
});
