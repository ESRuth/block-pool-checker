import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDE, guideMarkdown } from "../src/lib/guide";
import { PRIVACY, privacyMarkdown } from "../src/lib/privacy";

const FILE = new URL("../../../docs/GUIDE.md", import.meta.url);

describe("user guide", () => {
  it("docs/GUIDE.md is generated from the same text as the /help page", () => {
    if (process.env.UPDATE_GUIDE) writeFileSync(FILE, guideMarkdown());
    expect(readFileSync(FILE, "utf8")).toBe(guideMarkdown());
  });
  it("has unique section ids", () => {
    const ids = GUIDE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("privacy policy", () => {
  it("docs/PRIVACY.md is generated from the same text as the /privacy page", () => {
    const file = new URL("../../../docs/PRIVACY.md", import.meta.url);
    if (process.env.UPDATE_GUIDE) writeFileSync(file, privacyMarkdown());
    expect(readFileSync(file, "utf8")).toBe(privacyMarkdown());
  });
  it("has unique section ids", () => {
    const ids = PRIVACY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
