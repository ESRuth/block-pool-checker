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

const OWNER = "owner-code-owner-code-owner-code";
let clock = new Date("2026-11-02T12:00:00.000Z");
const setup = () => {
  const photos = new MemorySheetPhotos();
  const app = createApp({
    scores: {
      getScore: async () => {
        throw new Error("n/a");
      },
    },
    games: new EspnNfl(async () => {
      throw new Error("n/a");
    }),
    sheets: new MemorySheetRepository(() => clock),
    sheetPhotos: photos,
    inviteCode: OWNER,
    now: () => clock,
  });
  const req = (path: string, o: { method?: string; body?: unknown; key?: string; type?: string; raw?: Uint8Array } = {}) =>
    app.request(path, {
      method: o.method ?? (o.body === undefined && !o.raw ? "GET" : "POST"),
      body: (o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body))) as BodyInit | undefined,
      headers: { "Content-Type": o.type ?? "application/json", ...(o.key ? { "X-Invite-Code": o.key } : {}) },
    });
  return { app, req, photos };
};
type S = ReturnType<typeof setup>;

/** A venue with one runner; returns the runner's key and the venue's id. */
async function venue(s: S) {
  const runner = (await (await s.req("/api/owner/users", { body: { name: "Riley" }, key: OWNER })).json()) as any;
  const other = (await (await s.req("/api/owner/users", { body: { name: "Other" }, key: OWNER })).json()) as any;
  const v = (await (await s.req("/api/owner/venues", { body: { name: "Test Lodge", pin: "4821", runnerIds: [runner.id] }, key: OWNER })).json()) as any;
  return { runner, other, venueId: v.id as string };
}
const create = async (s: S, venueId: string, key: string, d: object = doc()) => {
  const r = await s.req("/api/sheets", { body: { venueId, doc: d }, key });
  return { res: r, body: (await r.json()) as any };
};

describe("saved sheets", () => {
  it("a runner makes a sheet on their venue as a draft; strangers and viewers see nothing, and marks stay with editors", async () => {
    const s = setup();
    const { runner, venueId } = await venue(s);
    const { res, body } = await create(s, venueId, runner.key);
    expect(res.status).toBe(201);
    expect(JSON.stringify(body)).not.toContain("editToken");
    expect((await s.req(`/api/sheets/${body.id}`)).status).toBe(404); // a draft is seen only by the people who run it
    const mine = (await (await s.req(`/api/sheets/${body.id}`, { key: runner.key })).json()) as any;
    expect(mine.canEdit).toBe(true);
    expect(mine.doc.mine).toEqual(["1,1"]);
    expect(mine.settings.draft).toBe(true);
    // Published, a viewer with the PIN still never gets the marked blocks.
    await s.req(`/api/sheets/${body.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key });
    const pass = (await s.req(`/api/venues/${venueId}/enter`, { body: { pin: "4821" } })).headers.get("set-cookie")!.split(";")[0]!;
    const viewer = await s.app.request(`/api/sheets/${body.id}`, { headers: { Cookie: pass } });
    const seen = (await viewer.json()) as any;
    expect(viewer.status).toBe(200);
    expect(seen.doc.names["8,6"].text).toBe("Ted Q");
    expect(seen.doc.mine).toEqual([]);
    expect(seen.canEdit).toBe(false);
  });

  it("only the owner or a runner of the venue can make a sheet on it", async () => {
    const s = setup();
    const { runner, other, venueId } = await venue(s);
    expect((await create(s, venueId, "")).res.status).toBe(403);
    expect((await create(s, venueId, other.key)).res.status).toBe(403); // invited, but not a runner here
    expect((await create(s, "nope", runner.key)).res.status).toBe(404);
    expect((await create(s, venueId, runner.key)).res.status).toBe(201);
    expect((await create(s, venueId, OWNER)).res.status).toBe(201);
  });

  it("keeps a sheet 7 days from the later of its making and the game, then it is gone", async () => {
    const s = setup();
    const { runner, venueId } = await venue(s);
    const { body } = await create(s, venueId, runner.key);
    expect(Date.parse(body.expiresAt)).toBe(clock.getTime() + RETENTION_DAYS * 86_400_000);
    clock = new Date(Date.parse(body.expiresAt) + 1000);
    expect((await s.req(`/api/sheets/${body.id}`, { key: OWNER })).status).toBe(404);
    clock = new Date("2026-11-02T12:00:00.000Z");
  });

  it("rejects bad documents: digits that aren't characters 0-9/?, unknown blocks, bad teams", async () => {
    const s = setup();
    const { runner, venueId } = await venue(s);
    expect((await create(s, venueId, runner.key, doc({ rows: { "shared.top": "93728061xx" } }))).res.status).toBe(400);
    expect((await create(s, venueId, runner.key, doc({ names: { "11,1": { text: "x", confirmed: true } } }))).res.status).toBe(400);
    expect((await create(s, venueId, runner.key, doc({ teams: { top: "", left: "x" } }))).res.status).toBe(400);
  });

  it("editing and deleting need the owner, the maker or a runner; anyone else is refused", async () => {
    const s = setup();
    const { runner, other, venueId } = await venue(s);
    const { body } = await create(s, venueId, runner.key);
    const next = doc({ mine: ["1,1", "2,2"] });
    const put = (key?: string) => s.req(`/api/sheets/${body.id}`, { method: "PUT", body: next, key });
    expect((await put()).status).toBe(403);
    expect((await put(other.key)).status).toBe(403);
    expect((await put("nope")).status).toBe(403);
    expect((await put(runner.key)).status).toBe(200);
    expect(((await (await s.req(`/api/sheets/${body.id}`, { key: runner.key })).json()) as any).doc.mine).toEqual(["1,1", "2,2"]);
    await s.req(`/api/sheets/${body.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key });
    expect((await s.req(`/api/sheets/${body.id}`, { method: "DELETE", key: other.key })).status).toBe(403);
    expect((await s.req(`/api/sheets/${body.id}`, { method: "DELETE", key: runner.key })).status).toBe(204);
    expect((await s.req(`/api/sheets/${body.id}`, { key: runner.key })).status).toBe(200); // soft delete: its maker still opens it, to restore it
    expect(((await (await s.req(`/api/sheets/${body.id}`, { key: runner.key })).json()) as any).deleted).toBeTruthy();
  });

  it("stores the photo privately: editors only, JPEG only, served back byte for byte, kept while the sheet is hidden, removed when it is deleted for good", async () => {
    const s = setup();
    const { runner, venueId } = await venue(s);
    const { body } = await create(s, venueId, runner.key);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const put = (key?: string, type = "image/jpeg") => s.req(`/api/sheets/${body.id}/photo`, { method: "PUT", raw: jpg, type, key });
    expect((await s.req(`/api/sheets/${body.id}/photo`, { key: runner.key })).status).toBe(404);
    expect((await put()).status).toBe(403);
    expect((await put(runner.key, "image/png")).status).toBe(415);
    const notJpeg = await s.req(`/api/sheets/${body.id}/photo`, {
      method: "PUT",
      raw: new TextEncoder().encode("<html>not a photo</html>"),
      type: "image/jpeg",
      key: runner.key,
    });
    expect(notJpeg.status).toBe(415); // the header says JPEG but the bytes are not
    expect(await s.photos.get(body.id)).toBeNull();
    expect((await put(runner.key)).status).toBe(204);
    const got = await s.req(`/api/sheets/${body.id}/photo`, { key: runner.key });
    expect(got.headers.get("Content-Type")).toBe("image/jpeg");
    expect(got.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(jpg);
    expect((await s.req(`/api/sheets/${body.id}/photo`)).status).toBe(404); // a stranger never gets a draft's photo
    await s.req(`/api/sheets/${body.id}`, { method: "DELETE", key: runner.key });
    expect(await s.photos.get(body.id)).not.toBeNull(); // a runner's delete only hides the sheet, so it can be restored
    expect((await s.req(`/api/owner/sheets/${body.id}`, { method: "DELETE", key: runner.key })).status).toBe(403);
    expect((await s.req(`/api/owner/sheets/${body.id}`, { method: "DELETE", key: OWNER })).status).toBe(204);
    expect(await s.photos.get(body.id)).toBeNull();
  });

  it("stamps the photo with the sheet's removal date, and moves the stamp when the game changes", async () => {
    const s = setup();
    const { runner, venueId } = await venue(s);
    const { body } = await create(s, venueId, runner.key);
    const put = await s.req(`/api/sheets/${body.id}/photo`, { method: "PUT", raw: new Uint8Array([0xff, 0xd8, 0xff, 1]), type: "image/jpeg", key: runner.key });
    expect(put.status).toBe(204);
    const first = s.photos.expiry.get(body.id);
    expect(first).toBe(body.expiresAt);
    const later = doc({ game: { ...doc().game, kickoff: "2026-12-20T18:00:00.000Z" } });
    const edited = await s.req(`/api/sheets/${body.id}`, { method: "PUT", body: later, key: runner.key });
    expect(edited.status).toBe(200);
    expect(s.photos.expiry.get(body.id)).toBe(((await edited.json()) as any).expiresAt);
    expect(s.photos.expiry.get(body.id)).not.toBe(first);
  });
});
