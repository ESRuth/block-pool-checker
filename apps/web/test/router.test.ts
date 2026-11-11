import { describe, expect, it, vi } from "vitest";
import { isInternalClick } from "../src/lib/router";

const anchor = (href: string, extra: Partial<HTMLAnchorElement> = {}) =>
  ({ href, target: "", hasAttribute: () => false, ...extra }) as unknown as HTMLAnchorElement;
const click = (over: Partial<MouseEvent> = {}) =>
  ({ button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over }) as MouseEvent;

describe("which clicks the app handles itself", () => {
  vi.stubGlobal("location", new URL("https://app.example/v/abc?x=1"));
  it("takes an ordinary click on a link to another page of the app", () => {
    expect(isInternalClick(click(), anchor("https://app.example/help"))).toBe(true);
    expect(isInternalClick(click(), anchor("https://app.example/new?venue=abc"))).toBe(true);
  });
  it("leaves new-tab clicks, other sites, the API, downloads and targets to the browser", () => {
    expect(isInternalClick(click({ metaKey: true }), anchor("https://app.example/help"))).toBe(false);
    expect(isInternalClick(click({ button: 1 }), anchor("https://app.example/help"))).toBe(false);
    expect(isInternalClick(click(), anchor("https://other.example/help"))).toBe(false);
    expect(isInternalClick(click(), anchor("https://app.example/api/sheets/x/photo"))).toBe(false);
    expect(isInternalClick(click(), anchor("https://app.example/help", { target: "_blank" }))).toBe(false);
    expect(isInternalClick(click(), anchor("https://app.example/help", { hasAttribute: (n: string) => n === "download" }))).toBe(false);
    expect(isInternalClick(click({ defaultPrevented: true }), anchor("https://app.example/help"))).toBe(false);
    expect(isInternalClick(click(), null)).toBe(false);
  });
  it("leaves a link to a spot on the same page to the browser", () => {
    expect(isInternalClick(click(), anchor("https://app.example/v/abc?x=1#top"))).toBe(false);
    expect(isInternalClick(click(), anchor("https://app.example/v/abc#top"))).toBe(true); // a different query is a different screen
  });
});
