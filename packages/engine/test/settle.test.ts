import { describe, expect, it } from "vitest";
import { parsePool, settle } from "../src/index.js";

const id = Array.from({ length: 10 }, (_, i) => i);
const mk = (settings: object, owners: Record<string, string>) =>
  parsePool({
    schema_version: 1,
    top_team: "Eagles",
    left_team: "Commanders",
    digits: { shared: { top: id, left: id } },
    owners,
    settings: { buyIn: 10, ...settings },
  });

// Identity digits: score (top, left) -> row = left%10 + 1, col = top%10 + 1.
// 10 squares sold = $100 pot; default split 15/30/15/40.
const owners = { "4,8": "Ann", "8,4": "Bob", "1,1": "Cy", "2,2": "Di", "3,3": "Ed", "5,5": "Flo", "6,6": "Gus", "7,7": "Hal", "9,9": "Ivy", "10,10": "Jo" };

describe("settle", () => {
  it("pays the forward winner the whole period when reverse is off", () => {
    const s = settle(mk({}, owners), { Q1: { top: 7, left: 3 } });
    expect(s.pot).toBe(100);
    expect(s.periods[0]!.payments).toEqual([{ kind: "forward", row: 4, col: 8, owner: "Ann", amount: 15 }]);
    expect(s.houseTotal).toBe(0);
  });
  it("splits a period between forward and reverse winners", () => {
    const s = settle(mk({ reverseShare: 20 }, owners), { Final: { top: 7, left: 3 } });
    expect(s.periods[0]!.payments).toEqual([
      { kind: "forward", row: 4, col: 8, owner: "Ann", amount: 32 },
      { kind: "reverse", row: 8, col: 4, owner: "Bob", amount: 8 },
    ]);
  });
  it("same-cell reverse (equal endings) pays once, in full", () => {
    const s = settle(mk({ reverseShare: 20 }, owners), { Q1: { top: 2, left: 12 } });
    expect(s.periods[0]!.payments).toHaveLength(1);
    expect(s.periods[0]!.payments[0]!.amount).toBe(15);
  });
  it("unsold winner goes to the house by default", () => {
    const s = settle(mk({}, owners), { Q1: { top: 9, left: 0 } }); // row 1, col 10: unsold
    expect(s.periods[0]!.payments).toEqual([]);
    expect(s.periods[0]!.toHouse).toBe(15);
    expect(s.houseTotal).toBe(15);
  });
  it("unsold winner rolls into the next settled period", () => {
    const p = mk({ unsoldWinner: "rollover" }, owners);
    const s = settle(p, { Q1: { top: 9, left: 0 }, Half: { top: 7, left: 3 } });
    expect(s.periods[0]).toMatchObject({ rolledForward: 15, toHouse: 0 });
    expect(s.periods[1]).toMatchObject({ carriedIn: 15, base: 30 });
    expect(s.periods[1]!.payments[0]!.amount).toBe(45);
    expect(s.pendingRollover).toBe(0);
  });
  it("rollover into a period that isn't official yet is pending; Final never rolls", () => {
    const p = mk({ unsoldWinner: "rollover" }, owners);
    expect(settle(p, { Q1: { top: 9, left: 0 } }).pendingRollover).toBe(15);
    const f = settle(p, { Final: { top: 9, left: 0 } });
    expect(f.pendingRollover).toBe(0);
    expect(f.houseTotal).toBe(40);
  });
  it("unallocated percentage is the house cut", () => {
    const p = mk({ payoutPercentages: { Q1: 10, Half: 20, Q3: 10, Final: 40 } }, owners);
    expect(settle(p, {}).houseTotal).toBe(20);
  });
  it("an unreadable name still counts as sold and gets paid", () => {
    const s = settle(mk({}, { ...owners, "4,8": "Unverified" }), { Q1: { top: 7, left: 3 } });
    expect(s.periods[0]!.payments[0]!.owner).toBe("Unverified");
  });
  it("validates new settings", () => {
    expect(() => mk({ reverseShare: 120 }, {})).toThrow();
    expect(() => mk({ unsoldWinner: "keep" }, {})).toThrow();
  });
});
