import { describe, expect, it } from "vitest";
import { MIN_OWNER_CODE_LENGTH, assertStrongOwnerCode } from "../src/access.js";

describe("owner code strength (checked at startup against real data)", () => {
  it("refuses a missing code", () => {
    expect(() => assertStrongOwnerCode(undefined)).toThrow(/required/);
    expect(() => assertStrongOwnerCode("")).toThrow(/required/);
  });
  it("refuses a short code", () => {
    expect(() => assertStrongOwnerCode("x".repeat(MIN_OWNER_CODE_LENGTH - 1))).toThrow(/at least/);
  });
  it("accepts a long code", () => {
    expect(() => assertStrongOwnerCode("x".repeat(MIN_OWNER_CODE_LENGTH))).not.toThrow();
  });
});
