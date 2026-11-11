import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ReadResultSchema, type ReadResult } from "@bpc/engine";
import { EspnNfl } from "@bpc/scores";
import { GeminiReader, MemorySheetPhotos, MemorySheetRepository, ReaderError, createApp, parseGrid, parseRead, type Reader } from "../src/index.js";

// Real Gemini 3.6 Flash answers recorded during the reader experiments (docs/READER_RESULTS.md) (digits, teams, corners only).
const reads = JSON.parse(readFileSync(new URL("./fixtures/flash_reads.json", import.meta.url), "utf8")) as Record<string, unknown>;
const read = (k: string): ReadResult => ReadResultSchema.parse(reads[k]);

const fakeReader = (r: ReadResult | Error, names: Array<string | null> | Error = ["Ted Q", null, "", "Ben + Emil", "a", "b", "c", "d", "e", "f"]): Reader => ({
  read: async () => {
    if (r instanceof Error) throw r;
    return { read: r, model: "fake", usage: { in: 1, out: 2 } };
  },
  readGrid: async () => {
    if (names instanceof Error) throw names;
    return { names: Array.from({ length: 10 }, () => names), model: "fake" };
  },
});
const app = (reader?: Reader, inviteCode?: string) =>
  createApp({
    scores: {
      getScore: async () => {
        throw new Error("n/a");
      },
    },
    games: new EspnNfl(async () => {
      throw new Error("n/a");
    }),
    sheets: new MemorySheetRepository(),
    sheetPhotos: new MemorySheetPhotos(),
    reader,
    inviteCode,
  });
const post = (a: ReturnType<typeof app>, body: BodyInit = new Uint8Array([1, 2, 3]), headers: Record<string, string> = { "Content-Type": "image/jpeg" }) =>
  a.request("/api/read", { method: "POST", body, headers });

describe("POST /api/read", () => {
  it("returns digits for a clean read (recorded Flash answer: Eagles/Commanders)", async () => {
    const res = await post(app(fakeReader(read("eagles_commanders"))));
    const j: any = await res.json();
    expect(res.status).toBe(200);
    expect(j.problems).toEqual([]);
    expect(j.digits.Q1.top).toEqual([9, 3, 7, 2, 8, 0, 6, 1, 5, 4]);
    expect(j.read.top_team).toBe("EAGLES");
  });
  it("keeps teams null when not visible (Chargers), and reads a shared set (Patriots)", async () => {
    const ch: any = await (await post(app(fakeReader(read("eagles_chargers"))))).json();
    expect(ch.read.top_team).toBeNull();
    expect(ch.read.left_team).toBeNull();
    expect(ch.digits.Final.left).toEqual([0, 2, 8, 1, 7, 9, 5, 3, 6, 4]);
    const pa: any = await (await post(app(fakeReader(read("patriots_rams"))))).json();
    expect(pa.digits).toEqual({ shared: { top: [6, 0, 1, 5, 7, 4, 9, 3, 2, 8], left: [9, 6, 5, 0, 7, 1, 3, 4, 2, 8] } });
  });
  it("hard stop: a bad row gives digits null and names the row (nothing guessed)", async () => {
    const r = structuredClone(read("eagles_chiefs")) as any;
    r.top.Half[3] = null;
    r.left.Q3[0] = r.left.Q3[1];
    const j: any = await (await post(app(fakeReader(r)))).json();
    expect(j.digits).toBeNull();
    expect(j.problems.map((p: any) => `${p.set}.${p.axis}:${p.kind}`).sort()).toEqual(["Half.top:unreadable_digit", "Q3.left:duplicate_digit"]);
  });
  it("disabled without a reader; access code enforced when configured", async () => {
    expect((await post(app())).status).toBe(503);
    const guarded = app(fakeReader(read("eagles_commanders")), "pw");
    expect((await post(guarded)).status).toBe(403);
    expect((await post(guarded, undefined, { "Content-Type": "image/jpeg", "X-Invite-Code": "nope" })).status).toBe(403);
    expect((await post(guarded, undefined, { "Content-Type": "image/jpeg", "X-Invite-Code": "pw" })).status).toBe(200);
  });
  it("rejects wrong content type, empty body and oversized images", async () => {
    const a = app(fakeReader(read("eagles_commanders")));
    expect((await post(a, "x", { "Content-Type": "application/json" })).status).toBe(415);
    expect((await post(a, new Uint8Array(0))).status).toBe(400);
    expect((await post(a, new Uint8Array(8 * 1024 * 1024 + 1))).status).toBe(413);
  });
  it("reader failure is a 502 with no upstream detail", async () => {
    const res = await post(app(fakeReader(new ReaderError("secret upstream detail"))));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret");
  });
  it("is not cacheable", async () => {
    expect((await post(app(fakeReader(read("eagles_commanders"))))).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("parseRead / GeminiReader", () => {
  it("parses JSON with surrounding text, rejects junk and wrong shapes", () => {
    const json = JSON.stringify(reads["eagles_commanders"]);
    expect(parseRead(`here you go:\n${json}\nthanks`).top_team).toBe("EAGLES");
    expect(() => parseRead("no json here")).toThrow(ReaderError);
    // Many "{" and no "}" must fail fast, not take quadratic time (a regex-based version did).
    const t0 = performance.now();
    expect(() => parseRead("{".repeat(60_000))).toThrow(ReaderError);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(() => parseRead('{"top_team": 3}')).toThrow(ReaderError);
  });
  it("calls Vertex with the image and skips thought parts", async () => {
    let sent: any;
    const fetcher = (async (_u: string, init: any) => {
      sent = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "reasoning", thought: true }, { text: JSON.stringify(reads["eagles_commanders"]) }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 7 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = new GeminiReader("proj", "gemini-3.6-flash", fetcher);
    (r as any).auth = { getAccessToken: async () => "tok" };
    const out = await r.read(new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(out.read.left_team).toBe("COMMANDERS");
    expect(out.usage).toEqual({ in: 10, out: 12 });
    expect(sent.contents[0].parts[0].inlineData).toMatchObject({ mimeType: "image/jpeg", data: "AQID" });
  });
  it("maps upstream errors to ReaderError without leaking the body", async () => {
    const r = new GeminiReader("proj", "m", (async () => new Response("echoed photo data", { status: 500 })) as unknown as typeof fetch);
    (r as any).auth = { getAccessToken: async () => "tok" };
    await expect(r.read(new Uint8Array([1]), "image/png")).rejects.toThrow(/upstream 500$/);
  });
});

describe("POST /api/read-names", () => {
  const b64 = Buffer.from([1, 2, 3]).toString("base64");
  const send = (a: ReturnType<typeof app>, body: unknown, headers: Record<string, string> = {}) =>
    a.request("/api/read-names", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });
  it("returns the 100 names of the grid image sent", async () => {
    const res = await send(app(fakeReader(read("eagles_commanders"))), { image: b64 });
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.names).toHaveLength(10);
    expect(j.names[3].slice(0, 4)).toEqual(["Ted Q", null, "", "Ben + Emil"]);
  });
  it("guards: no reader 503, access code 403, bad body 400, upstream failure 502 without detail", async () => {
    const body = { image: b64 };
    expect((await send(app(), body)).status).toBe(503);
    expect((await send(app(fakeReader(read("eagles_commanders")), "pw"), body)).status).toBe(403);
    expect((await send(app(fakeReader(read("eagles_commanders")), "pw"), body, { "X-Invite-Code": "pw" })).status).toBe(200);
    expect((await send(app(fakeReader(read("eagles_commanders"))), {})).status).toBe(400);
    const bad = await send(app(fakeReader(read("eagles_commanders"), new ReaderError("secret detail"))), body);
    expect(bad.status).toBe(502);
    expect(await bad.text()).not.toContain("secret");
  });
});

describe("parseGrid", () => {
  it("trims, keeps blanks as empty and unreadable as null, pads to 10x10, tolerates surrounding text", () => {
    const g = parseGrid('sure: {"rows":[["  Ted Q ","",null,"Ben + Emil"]]}');
    expect(g).toHaveLength(10);
    expect(g[0]).toHaveLength(10);
    expect(g[0]!.slice(0, 5)).toEqual(["Ted Q", "", null, "Ben + Emil", null]);
    expect(g[9]!.every((n) => n === null)).toBe(true);
    expect(() => parseGrid("nope")).toThrow(ReaderError);
  });
});
