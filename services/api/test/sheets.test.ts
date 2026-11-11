import { describe, expect, it } from "vitest";
import { EspnNfl } from "@bpc/scores";
import { MemorySheetPhotos, MemorySheetRepository, RETENTION_DAYS, createApp } from "../src/index.js";

const team = (abbr: string, name: string) => ({ abbr, name: `${abbr} ${name}`, nickname: name });
const doc = (over: object = {}) => ({
  width: 2048,
  height: 1542,
  corners: [
    [460, 428],
    [1816, 432],
    [1843, 1438],
    [441, 1404],
  ],
  teams: { top: "Eagles", left: "Commanders" },
  mode: "shared",
  rows: { "shared.top": "9372806154", "shared.left": "8954726301" },
  game: { gameId: "g1", kickoff: "2026-11-01T18:00:00.000Z", status: "final", home: team("WSH", "Commanders"), away: team("PHI", "Eagles"), label: "Week 9" },
  finalIncludesOvertime: true,
  names: { "8,6": { text: "Ted Q", confirmed: false } },
  mine: ["1,1"],
  ...over,
});

let clock = new Date("2026-11-02T12:00:00.000Z");
const setup = () => {
  const photos = new MemorySheetPhotos();
  const sheets = new MemorySheetRepository(() => clock);
  const app = createApp({
    scores: {
      getScore: async () => {
        throw new Error("n/a");
      },
    },
    games: new EspnNfl(async () => {
      throw new Error("n/a");
    }),
    sheets,
    sheetPhotos: photos,
    now: () => clock,
  });
  const json = (body: unknown, method = "POST", token?: string) => ({
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { app, json, photos };
};
const create = async (s: ReturnType<typeof setup>, d: object = doc()) => {
  const r = await s.app.request("/api/sheets", s.json(d));
  return { res: r, body: (await r.json()) as any };
};

describe("saved sheets", () => {
  it("creates with a one-time edit token, and a view never exposes it", async () => {
    const s = setup();
    const { res, body } = await create(s);
    expect(res.status).toBe(201);
    expect(body.editToken).toMatch(/\S{20,}/);
    const got = (await (await s.app.request(`/api/sheets/${body.id}`)).json()) as any;
    expect(got.doc.names["8,6"].text).toBe("Ted Q");
    expect(got.doc.mine).toEqual([]); // the creator marked 1,1, but a view-only request never gets marked blocks
    const asEditor = (await (await s.app.request(`/api/sheets/${body.id}`, { headers: { Authorization: `Bearer ${body.editToken}` } })).json()) as any;
    expect(asEditor.doc.mine).toEqual(["1,1"]);
    expect(asEditor.canEdit).toBe(true);
    expect(JSON.stringify(got)).not.toContain(body.editToken);
    expect(JSON.stringify(got)).not.toContain("editTokenHash");
  });

  it("keeps a sheet 30 days from the later of its making and the game, then it is gone", async () => {
    const s = setup();
    const { body } = await create(s);
    expect(Date.parse(body.expiresAt)).toBe(clock.getTime() + RETENTION_DAYS * 86_400_000);
    clock = new Date(Date.parse(body.expiresAt) + 1000);
    expect((await s.app.request(`/api/sheets/${body.id}`)).status).toBe(404);
    clock = new Date("2026-11-02T12:00:00.000Z");
  });

  it("rejects bad documents: digits that aren't characters 0-9/?, unknown blocks, bad teams", async () => {
    const s = setup();
    expect((await create(s, doc({ rows: { "shared.top": "93728061xx" } }))).res.status).toBe(400);
    expect((await create(s, doc({ names: { "11,1": { text: "x", confirmed: true } } }))).res.status).toBe(400);
    expect((await create(s, doc({ teams: { top: "", left: "x" } }))).res.status).toBe(400);
  });

  it("editing and deleting need the token; a wrong token is refused", async () => {
    const s = setup();
    const { body } = await create(s);
    const next = doc({ mine: ["1,1", "2,2"] });
    expect((await s.app.request(`/api/sheets/${body.id}`, s.json(next, "PUT"))).status).toBe(403);
    expect((await s.app.request(`/api/sheets/${body.id}`, s.json(next, "PUT", "nope"))).status).toBe(403);
    expect((await s.app.request(`/api/sheets/${body.id}`, s.json(next, "PUT", body.editToken))).status).toBe(200);
    expect(
      ((await (await s.app.request(`/api/sheets/${body.id}`, { headers: { Authorization: `Bearer ${body.editToken}` } })).json()) as any).doc.mine,
    ).toEqual(["1,1", "2,2"]);
    expect((await s.app.request(`/api/sheets/${body.id}`, { method: "DELETE" })).status).toBe(403);
    expect((await s.app.request(`/api/sheets/${body.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${body.editToken}` } })).status).toBe(204);
    expect((await s.app.request(`/api/sheets/${body.id}`)).status).toBe(404);
  });

  it("stores the photo privately: needs the token to upload, JPEG only, served back byte for byte, kept while the sheet is hidden, removed when it is deleted for good", async () => {
    const s = setup();
    const { body } = await create(s);
    const jpg = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
    const put = (token?: string, type = "image/jpeg") =>
      s.app.request(`/api/sheets/${body.id}/photo`, {
        method: "PUT",
        body: jpg,
        headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    expect((await s.app.request(`/api/sheets/${body.id}/photo`)).status).toBe(404);
    expect((await put()).status).toBe(403);
    expect((await put(body.editToken, "image/png")).status).toBe(415);
    expect((await put(body.editToken)).status).toBe(204);
    const got = await s.app.request(`/api/sheets/${body.id}/photo`);
    expect(got.headers.get("Content-Type")).toBe("image/jpeg");
    expect(got.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(jpg);
    await s.app.request(`/api/sheets/${body.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${body.editToken}` } });
    expect(await s.photos.get(body.id)).not.toBeNull(); // a runner's delete only hides the sheet, so it can be restored
    expect((await s.app.request(`/api/owner/sheets/${body.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await s.photos.get(body.id)).toBeNull();
  });

  it("stamps the photo with the sheet's removal date, and moves the stamp when the game changes", async () => {
    const s = setup();
    const { body } = await create(s);
    const put = await s.app.request(`/api/sheets/${body.id}/photo`, {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${body.editToken}` },
    });
    expect(put.status).toBe(204);
    const first = s.photos.expiry.get(body.id);
    expect(first).toBe(body.expiresAt);
    const later = doc({ game: { ...doc().game, kickoff: "2026-12-20T18:00:00.000Z" } });
    const edited = await s.app.request(`/api/sheets/${body.id}`, s.json(later, "PUT", body.editToken));
    expect(edited.status).toBe(200);
    expect(s.photos.expiry.get(body.id)).toBe(((await edited.json()) as any).expiresAt);
    expect(s.photos.expiry.get(body.id)).not.toBe(first);
  });
  it("enforces the access code on create when one is configured", async () => {
    const s = setup();
    const gated = createApp({
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
      inviteCode: "pw",
    });
    expect((await gated.request("/api/sheets", s.json(doc()))).status).toBe(403);
    expect((await gated.request("/api/sheets", { ...s.json(doc()), headers: { "Content-Type": "application/json", "X-Invite-Code": "pw" } })).status).toBe(201);
  });
});
