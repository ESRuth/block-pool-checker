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
  it("sends the personal key when this phone has one, so marked blocks come back and are not overwritten by the next save", async () => {
    let seen: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: { headers: Record<string, string> }) => {
      seen = init.headers;
      return new Response(JSON.stringify({ doc: {}, hasPhoto: true, expiresAt: "", canEdit: true }), { status: 200 });
    });
    store["bpc.key"] = "key123";
    await loadSheet("abc");
    expect(seen["X-Invite-Code"]).toBe("key123");
    delete store["bpc.key"];
    await loadSheet("abc");
    expect(seen["X-Invite-Code"]).toBeUndefined();
  });
});

describe("whoAmI", () => {
  it("returns null when the server refuses the key, and throws (never null) when it cannot be reached or errors", async () => {
    const { whoAmI } = await import("../src/lib/access");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    expect(await whoAmI("bad")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    await expect(whoAmI("k")).rejects.toThrow();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    await expect(whoAmI("k")).rejects.toThrow();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ name: "Riley", owner: false }), { status: 200 }));
    expect(await whoAmI("k")).toEqual({ name: "Riley", owner: false });
  });
});
