import { describe, expect, it } from "vitest";
import { distance, similarCells } from "../src/lib/similar";

const n = (text: string) => ({ text, confirmed: false });

describe("similarCells", () => {
  const names = { "1,1": n("Emil Rowe"), "1,2": n("Emol"), "1,3": n("Emli R"), "1,4": n("Skyes"), "1,5": n("Mark"), "1,6": n("Enl Rowe"), "1,7": n("") };
  it("suggests near-misses of a typed name, not exact matches, unrelated names or empty squares", () => {
    expect(similarCells(names, "emil", ["1,1"])).toEqual(["1,2", "1,3"]); // Emol (one letter off) and Emli R (two letters swapped); Enl is two slips away: too loose
    expect(similarCells(names, "emil", ["1,1"])).not.toContain("1,4");
  });
  it("allows two slips only for longer words, and ignores very short queries", () => {
    const m = { "1,1": n("Skyez"), "1,2": n("Skys") };
    expect(similarCells(m, "skyes", [])).toEqual(["1,1", "1,2"]);
    expect(similarCells({ "1,1": n("Xo") }, "bob", [])).toEqual([]); // 2 slips on a 3-letter word: too loose
    expect(similarCells(names, "ab", [])).toEqual([]);
  });
  it("distance counts single-letter slips", () => {
    expect(distance("emil", "emol")).toBe(1);
    expect(distance("emil", "emil")).toBe(0);
    expect(distance("emil", "")).toBe(4);
    expect(distance("emil", "emli")).toBe(1);
  });
});
