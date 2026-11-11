import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSheet } from "../src/lib/sheetApi";

const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

afterEach(() => vi.unstubAllGlobals);

describe("loadSheet", () => {
  it("sends the edit token when it has one, so marked blocks come back and are not overwritten by the next save", async () => {
    let seen: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: { headers: Record<string, string> }) => {
      seen = init.headers;
      return new Response(JSON.stringify({ doc: {}, hasPhoto: true, expiresAt: "", canEdit: true }), { status: 200 });
    });
    await loadSheet("abc", "tok123");
    expect(seen.Authorization).toBe("Bearer tok123");
    await loadSheet("abc");
    expect(seen.Authorization).toBeUndefined();
  });
});
