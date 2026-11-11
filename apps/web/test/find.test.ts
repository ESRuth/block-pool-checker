import { describe, expect, it } from "vitest";
import { findBlocks } from "../src/lib/find";

const n = (text: string) => ({ text, confirmed: false });
const names = { "1,1": n("Emil Rowe"), "1,2": n("Ben + Emil"), "2,1": n("Skyes"), "2,2": n("Emilia"), "3,3": n(""), "10,1": n("EMIL R") };

describe("findBlocks", () => {
  it("finds a first name wherever it sits, including 'Ben + Emil', ignoring case and punctuation", () => {
    expect(findBlocks(names, "emil")).toEqual(["1,1", "1,2", "2,2", "10,1"]); // "Emilia" starts with "emil" too
  });
  it("every typed word must match: 'emil rowe' does not find Ben + Emil", () => {
    expect(findBlocks(names, "Emil Rowe")).toEqual(["1,1"]);
  });
  it("finds a person by nickname and ignores empty blocks and empty queries", () => {
    expect(findBlocks(names, "skyes")).toEqual(["2,1"]);
    expect(findBlocks(names, "  ")).toEqual([]);
    expect(findBlocks(names, "zzz")).toEqual([]);
  });
  it("matches inside a word only from three letters, so one stray letter does not light up the sheet", () => {
    expect(findBlocks(names, "mil")).toEqual(["1,1", "1,2", "2,2", "10,1"]);
    expect(findBlocks(names, "r")).toEqual(["1,1", "10,1"]); // starts-with only
  });
});
