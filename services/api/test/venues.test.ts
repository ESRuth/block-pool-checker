import { describe, expect, it } from "vitest";
import { EspnNfl } from "@bpc/scores";
import { MemorySheetPhotos, MemorySheetRepository, VENUE_RETENTION_DAYS, RETENTION_DAYS, createApp } from "../src/index.js";

const team = (abbr: string, name: string) => ({ abbr, name: `${abbr} ${name}`, nickname: name });
const doc = () => ({
  width: 2048,
  height: 1542,
  corners: [
    [460, 428],
    [1816, 432],
    [1843, 1438],
    [441, 1404],
  ],
  teams: { top: "Eagles", left: "Chiefs" },
  mode: "shared",
  rows: { "shared.top": "9372806154", "shared.left": "8954726301" },
  game: { gameId: "g1", kickoff: "2026-11-11T18:00:00.000Z", status: "scheduled", home: team("KC", "Chiefs"), away: team("PHI", "Eagles"), label: "Week 10" },
  finalIncludesOvertime: true,
  names: { "8,6": { text: "Ted Q", confirmed: true } },
  mine: ["1,1"],
});

const OWNER = "owner-code-owner-code-owner-code";
let clock = new Date("2026-11-10T12:00:00.000Z");
const setup = () => {
  const photos = new MemorySheetPhotos();
  const app = createApp({
    scores: { getScore: async () => Promise.reject(new Error("n/a")) },
    games: new EspnNfl(async () => Promise.reject(new Error("n/a"))),
    sheets: new MemorySheetRepository(() => clock),
    sheetPhotos: photos,
    inviteCode: OWNER,
    now: () => clock,
  });
  const req = (path: string, o: { method?: string; body?: unknown; key?: string; cookie?: string } = {}) =>
    app.request(path, {
      method: o.method ?? (o.body === undefined ? "GET" : "POST"),
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      headers: { "Content-Type": "application/json", ...(o.key ? { "X-Invite-Code": o.key } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) },
    });
  return { app, req };
};
type S = ReturnType<typeof setup>;
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0]!;

async function venueWithSheet(s: S, over: { pin?: string; publish?: boolean } = {}) {
  const runner = (await (await s.req("/api/owner/users", { body: { name: "Riley" }, key: OWNER })).json()) as any;
  const me = (await (await s.req("/api/owner/users", { body: { name: "Other" }, key: OWNER })).json()) as any;
  const v = (await (
    await s.req("/api/owner/venues", { body: { name: "Test Lodge", pin: over.pin ?? "4821", runnerIds: [runner.id] }, key: OWNER })
  ).json()) as any;
  const made = (await (await s.req("/api/sheets", { body: doc(), key: runner.key })).json()) as any;
  await s.app.request(`/api/sheets/${made.id}/photo`, {
    method: "PUT",
    body: new Uint8Array([1, 2, 3]),
    headers: { "Content-Type": "image/jpeg", "X-Invite-Code": runner.key },
  });
  const att = await s.app.request(`/api/sheets/${made.id}/settings`, {
    method: "PATCH",
    body: JSON.stringify({ venueId: v.id, title: "Eagles v Chiefs 11/11 $10" }),
    headers: { "Content-Type": "application/json", "X-Invite-Code": runner.key },
  });
  expect(att.status).toBe(200);
  expect(((await att.json()) as any).settings.draft).toBe(true); // joining a venue starts as a draft
  if (over.publish !== false) await s.req(`/api/sheets/${made.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key });
  return { runner, other: me, v, sheet: made };
}

describe("venues", () => {
  it("only the owner makes venues; a PIN is 4 to 8 digits", async () => {
    const s = setup();
    expect((await s.req("/api/owner/venues", { body: { name: "X", pin: "1234" } })).status).toBe(403);
    expect((await s.req("/api/owner/venues", { body: { name: "X", pin: "12" }, key: OWNER })).status).toBe(400);
    expect((await s.req("/api/owner/venues", { body: { name: "X", pin: "123456" }, key: OWNER })).status).toBe(201);
  });

  it("shows only the name before the PIN, then the sheets after it", async () => {
    const s = setup();
    const { v } = await venueWithSheet(s);
    const before = (await (await s.req(`/api/venues/${v.id}`)).json()) as any;
    expect(before).toEqual({ name: "Test Lodge", pinRequired: true });
    const wrong = await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "0000" } });
    expect(wrong.status).toBe(403);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const ok = await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(ok.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
    const after = (await (await s.req(`/api/venues/${v.id}`, { cookie: cookieOf(ok) })).json()) as any;
    expect(after.sheets.map((x: any) => x.title)).toEqual(["Eagles v Chiefs 11/11 $10"]);
    expect(after.canManage).toBe(false);
  });

  it("locks after repeated wrong PINs, even for the right PIN, and unlocks later", async () => {
    const s = setup();
    const { v } = await venueWithSheet(s);
    for (let i = 0; i < 5; i++) expect((await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "1111" } })).status).toBe(403);
    const locked = await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } });
    expect(locked.status).toBe(429);
    clock = new Date(clock.getTime() + 2 * 60_000);
    expect((await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } })).status).toBe(200);
  });

  it("a sheet in a venue needs the pass, hides its photo from viewers, and never shows marked blocks", async () => {
    const s = setup();
    const { v, sheet, runner } = await venueWithSheet(s);
    const raw = await s.req(`/api/sheets/${sheet.id}`);
    expect(raw.status).toBe(401);
    expect(await raw.json()).toEqual({ error: "PIN required", pinRequired: true, title: "Eagles v Chiefs 11/11 $10" });
    expect((await s.req(`/api/sheets/${sheet.id}/photo`)).status).toBe(401);

    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    const view = (await (await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).json()) as any;
    expect(view.canEdit).toBe(false);
    expect(view.doc.mine).toEqual([]);
    expect(view.hasPhoto).toBe(false);
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { cookie: pass })).status).toBe(403);

    // The runner sees everything without a PIN.
    const mine = (await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any;
    expect(mine.canEdit).toBe(true);
    expect(mine.doc.mine).toEqual(["1,1"]);
  });

  it("a runner can let viewers see the photo", async () => {
    const s = setup();
    const { v, sheet, runner } = await venueWithSheet(s);
    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { cookie: pass })).status).toBe(403);
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { key: runner.key })).status).toBe(200);
    await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { showPhoto: true }, key: runner.key });
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { cookie: pass })).status).toBe(200);
  });

  it("changing the venue PIN signs everyone out", async () => {
    const s = setup();
    const { v, sheet, runner } = await venueWithSheet(s);
    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(200);
    expect((await s.req(`/api/venues/${v.id}`, { method: "PATCH", body: { pin: "9999" }, key: runner.key })).status).toBe(200);
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(401);
    expect((await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } })).status).toBe(403);
    expect((await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "9999" } })).status).toBe(200);
  });

  it("a sheet's own PIN overrides the venue's", async () => {
    const s = setup();
    const { v, sheet, runner } = await venueWithSheet(s);
    await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { pin: "7777" }, key: runner.key });
    const venuePass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: venuePass })).status).toBe(401);
    expect((await s.req(`/api/sheets/${sheet.id}/enter`, { body: { pin: "4821" } })).status).toBe(403); // the venue PIN no longer opens it
    const own = cookieOf(await s.req(`/api/sheets/${sheet.id}/enter`, { body: { pin: "7777" } }));
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: own })).status).toBe(200);
    // clearing the override returns to the venue PIN
    await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { pin: null }, key: runner.key });
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: venuePass })).status).toBe(200);
  });

  it("the owner and the venue's runners run it; other keys and viewers do not", async () => {
    const s = setup();
    const { v, sheet, runner, other } = await venueWithSheet(s);
    expect((await s.req(`/api/sheets/${sheet.id}`, { key: OWNER })).status).toBe(200);
    const b = { method: "PATCH", body: { name: "Test Lodge" } };
    expect((await s.req(`/api/venues/${v.id}`, { ...b, key: other.key })).status).toBe(403);
    expect((await s.req(`/api/venues/${v.id}`, b)).status).toBe(403);
    expect((await s.req(`/api/venues/${v.id}`, { ...b, key: runner.key })).status).toBe(200);
    expect((await s.req(`/api/sheets/${sheet.id}`, { key: other.key })).status).toBe(401);
    // a backup added by the owner can then edit the sheet
    await s.req(`/api/venues/${v.id}`, { method: "PATCH", body: { runnerIds: [runner.id, other.id] }, key: OWNER });
    const got = (await (await s.req(`/api/sheets/${sheet.id}`, { key: other.key })).json()) as any;
    expect(got.canEdit).toBe(true);
    // runners cannot change who runs it, nor attach sheets to venues they don't run
    expect((await s.req(`/api/venues/${v.id}`, { method: "PATCH", body: { runnerIds: [] }, key: runner.key })).status).toBe(403);
    const mine = (await (await s.req("/api/sheets", { body: doc(), key: other.key })).json()) as any;
    const v2 = (await (await s.req("/api/owner/venues", { body: { name: "Other place", pin: "1234" }, key: OWNER })).json()) as any;
    expect((await s.req(`/api/sheets/${mine.id}/settings`, { method: "PATCH", body: { venueId: v2.id }, key: other.key })).status).toBe(403);
  });

  it("venue sheets are removed after a week, others after 30 days", async () => {
    const s = setup();
    const { sheet, runner } = await venueWithSheet(s);
    const plain = (await (await s.req("/api/sheets", { body: doc(), key: runner.key })).json()) as any;
    const days = (iso: string) => Math.round((Date.parse(iso) - Date.parse("2026-11-11T18:00:00.000Z")) / 86_400_000);
    const a = (await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any;
    expect(days(a.expiresAt)).toBe(VENUE_RETENTION_DAYS);
    expect(days(plain.expiresAt)).toBe(RETENTION_DAYS);
  });

  it("a sheet is posted first: viewers see only that it is open for blocks; the photo takes it to draft, and publishing opens it", async () => {
    const s = setup();
    const { v, runner, other } = await venueWithSheet(s);
    const game = { ...doc().game, kickoff: "2026-11-12T01:00:00.000Z" };
    const body = { teams: { top: "Eagles", left: "Chiefs" }, game, title: "Eagles v Chiefs 11/11 $5" };
    expect((await s.req(`/api/venues/${v.id}/sheets`, { body: { title: "x" }, key: runner.key })).status).toBe(400); // needs a game and the teams' places
    expect((await s.req(`/api/venues/${v.id}/sheets`, { body })).status).toBe(403);
    expect((await s.req(`/api/venues/${v.id}/sheets`, { body, key: other.key })).status).toBe(403);
    const posted = (await (await s.req(`/api/venues/${v.id}/sheets`, { body, key: runner.key })).json()) as any;

    // viewers with the PIN: a bare line (the game, the date), no id, no way in
    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    const seen = (await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any;
    const line = seen.sheets.find((x: any) => x.stage === "posted");
    expect(line).toEqual({ stage: "posted", title: "Eagles v Chiefs 11/11 $5", teams: { top: "Eagles", left: "Chiefs" }, kickoff: game.kickoff });
    expect((await s.req(`/api/sheets/${posted.id}`, { cookie: pass })).status).toBe(404);
    expect((await s.req(`/api/sheets/${posted.id}/enter`, { body: { pin: "4821" } })).status).toBe(404);

    // runners: the same sheet with its id and stage
    const run = (await (await s.req(`/api/venues/${v.id}`, { key: runner.key })).json()) as any;
    expect(run.sheets.map((x: any) => x.stage).sort()).toEqual(["posted", "published"]);
    const mine = (await (await s.req(`/api/sheets/${posted.id}`, { key: runner.key })).json()) as any;
    expect(mine.settings).toMatchObject({ posted: true, draft: false, venueId: v.id });
    expect(mine.hasPhoto).toBe(false);
    expect(((await (await s.req("/api/my/sheets", { key: runner.key })).json()) as any).sheets.find((x: any) => x.id === posted.id).posted).toBe(true);
    expect((await s.req(`/api/sheets/${posted.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key })).status).toBe(200);
    expect(((await (await s.req(`/api/sheets/${posted.id}`, { key: runner.key })).json()) as any).settings.posted).toBe(true); // cannot be published without its photo

    // adding the photo (after the digits are drawn): the real grid replaces the placeholder, and the sheet becomes a draft
    expect((await s.req(`/api/sheets/${posted.id}`, { method: "PUT", body: doc(), key: runner.key })).status).toBe(200);
    await s.app.request(`/api/sheets/${posted.id}/photo`, {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
      headers: { "Content-Type": "image/jpeg", "X-Invite-Code": runner.key },
    });
    const draft = (await (await s.req(`/api/sheets/${posted.id}`, { key: runner.key })).json()) as any;
    expect(draft.settings).toMatchObject({ posted: false, draft: true });
    const still = (await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any;
    expect(still.sheets.filter((x: any) => x.stage === "posted")).toHaveLength(1); // viewers still just see "open for blocks"
    expect((await s.req(`/api/sheets/${posted.id}`, { cookie: pass })).status).toBe(404);

    // publish: now it is a sheet people can open
    await s.req(`/api/sheets/${posted.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key });
    const after = (await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any;
    expect(after.sheets.filter((x: any) => x.stage === "posted")).toHaveLength(0);
    expect(after.sheets.filter((x: any) => x.stage === "published")).toHaveLength(2);
    expect((await s.req(`/api/sheets/${posted.id}`, { cookie: pass })).status).toBe(200);
  });

  it("closing a venue deletes its sheets", async () => {
    const s = setup();
    const { v, sheet, runner } = await venueWithSheet(s);
    expect((await s.req(`/api/venues/${v.id}`, { method: "DELETE", key: runner.key })).status).toBe(403);
    expect((await s.req(`/api/venues/${v.id}`, { method: "DELETE", key: OWNER })).status).toBe(204);
    expect((await s.req(`/api/sheets/${sheet.id}`, { key: OWNER })).status).toBe(404);
    expect((await s.req(`/api/venues/${v.id}`)).status).toBe(404);
  });

  it("sheets outside a venue behave as before: the link opens them, photo included", async () => {
    const s = setup();
    const made = (await (await s.req("/api/sheets", { body: doc(), key: OWNER })).json()) as any;
    const got = (await (await s.req(`/api/sheets/${made.id}`)).json()) as any;
    expect(got.canEdit).toBe(false);
  });

  it("a deleted sheet is hidden from viewers and links, shown marked to the people who run it, and they can restore it", async () => {
    const s = setup();
    const { v, sheet, runner, other } = await venueWithSheet(s);
    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));
    expect((await s.req(`/api/sheets/${sheet.id}`, { method: "DELETE", key: runner.key })).status).toBe(204);

    // viewers: the venue list and the sheet are gone, and so is any write
    expect(((await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any).sheets).toEqual([]);
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}`, { key: other.key })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}`, { method: "PUT", body: doc(), key: runner.key })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { key: runner.key })).status).toBe(404);

    // the runner still finds it, marked, in the venue and in their list; opening it says it is deleted and when it goes for good
    const inVenue = (await (await s.req(`/api/venues/${v.id}`, { key: runner.key })).json()) as any;
    expect(inVenue.sheets.map((x: any) => x.stage)).toEqual(["deleted"]);
    const mine = (await (await s.req("/api/my/sheets", { key: runner.key })).json()) as any;
    expect(mine.sheets[0].deletedAt).toBeTruthy();
    expect(mine.sheets[0].goneOn).toBeTruthy();
    const opened = (await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any;
    expect(opened.deleted).toMatchObject({ canErase: false });
    expect(opened.hasPhoto).toBe(false);
    const asOwner = (await (await s.req(`/api/sheets/${sheet.id}`, { key: OWNER })).json()) as any;
    expect(asOwner.deleted.canErase).toBe(true);

    // restoring: a stranger cannot, the runner can; it is back for viewers exactly as before
    expect((await s.req(`/api/sheets/${sheet.id}/restore`, { method: "POST", body: {}, key: other.key })).status).toBe(403);
    expect((await s.req(`/api/sheets/${sheet.id}/restore`, { method: "POST", body: {} })).status).toBe(403);
    expect((await s.req(`/api/sheets/${sheet.id}/restore`, { method: "POST", body: {}, key: runner.key })).status).toBe(200);
    expect(((await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any).sheets).toHaveLength(1);
    expect(((await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any).deleted).toBeUndefined();

    // only the owner makes a delete permanent
    await s.req(`/api/sheets/${sheet.id}`, { method: "DELETE", key: runner.key });
    expect((await s.req(`/api/owner/sheets/${sheet.id}`, { method: "DELETE", key: runner.key })).status).toBe(403);
    expect((await s.req(`/api/owner/sheets/${sheet.id}`, { method: "DELETE", key: OWNER })).status).toBe(204);
    expect((await s.req(`/api/sheets/${sheet.id}/restore`, { method: "POST", body: {}, key: OWNER })).status).toBe(404);
  });

  it("a deleted sheet goes for good when its normal expiry arrives", async () => {
    const s = setup();
    const { sheet, runner } = await venueWithSheet(s);
    await s.req(`/api/sheets/${sheet.id}`, { method: "DELETE", key: runner.key });
    clock = new Date("2026-11-20T12:00:00.000Z"); // past kickoff + 7 days
    expect(((await (await s.req("/api/my/sheets", { key: OWNER })).json()) as any).sheets).toEqual([]);
    expect((await s.req(`/api/sheets/${sheet.id}/restore`, { method: "POST", body: {}, key: OWNER })).status).toBe(404);
  });

  it("a draft sheet is seen only by the people who run the venue until they publish it", async () => {
    const s = setup();
    const { v, sheet, runner, other } = await venueWithSheet(s, { publish: false });
    const pass = cookieOf(await s.req(`/api/venues/${v.id}/enter`, { body: { pin: "4821" } }));

    // viewers: only a bare "open for blocks" line with no id, and the sheet is not openable, even with the PIN pass
    const onWall = ((await (await s.req(`/api/venues/${v.id}`, { cookie: pass })).json()) as any).sheets;
    expect(onWall.map((x: any) => [x.stage, "id" in x])).toEqual([["posted", false]]);
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}`, { key: other.key })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}/photo`, { cookie: pass })).status).toBe(404);
    expect((await s.req(`/api/sheets/${sheet.id}/enter`, { body: { pin: "4821" } })).status).toBe(404);

    // runners and the owner: listed and marked as a draft, and it opens normally
    const mine = (await (await s.req(`/api/venues/${v.id}`, { key: runner.key })).json()) as any;
    expect(mine.sheets.map((x: any) => x.stage)).toEqual(["draft"]);
    expect(((await (await s.req("/api/my/sheets", { key: runner.key })).json()) as any).sheets[0].draft).toBe(true);
    expect(((await (await s.req(`/api/sheets/${sheet.id}`, { key: OWNER })).json()) as any).settings.draft).toBe(true);

    // publish makes it visible; taking it back hides it again; leaving the venue clears the stage
    await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { draft: false }, key: runner.key });
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(200);
    await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { draft: true }, key: runner.key });
    expect((await s.req(`/api/sheets/${sheet.id}`, { cookie: pass })).status).toBe(404);
    const off = (await (await s.req(`/api/sheets/${sheet.id}/settings`, { method: "PATCH", body: { venueId: null }, key: runner.key })).json()) as any;
    expect(off.settings.draft).toBe(false);
  });

  it("a sheet outside a venue has no draft stage", async () => {
    const s = setup();
    const made = (await (await s.req("/api/sheets", { body: doc(), key: OWNER })).json()) as any;
    const r = (await (await s.req(`/api/sheets/${made.id}/settings`, { method: "PATCH", body: { draft: true }, key: OWNER })).json()) as any;
    expect(r.settings.draft).toBe(false);
    expect((await s.req(`/api/sheets/${made.id}`)).status).toBe(200);
  });

  it("editing a sheet does not move the day it is removed", async () => {
    const s = setup();
    const { sheet, runner } = await venueWithSheet(s);
    const before = ((await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any).expiresAt;
    clock = new Date("2026-11-13T09:00:00.000Z"); // after the game
    expect((await s.req(`/api/sheets/${sheet.id}`, { method: "PUT", body: doc(), key: runner.key })).status).toBe(200);
    const after = ((await (await s.req(`/api/sheets/${sheet.id}`, { key: runner.key })).json()) as any).expiresAt;
    expect(after).toBe(before);
  });
});

describe("many guesses at once", () => {
  it("cannot all read the same failure count: the PIN still locks after the free tries", async () => {
    const s = setup();
    const v = (await (await s.req("/api/owner/venues", { body: { name: "Test Lodge", pin: "4821" }, key: OWNER })).json()) as any;
    const replies = await Promise.all(Array.from({ length: 30 }, (_, i) => s.req(`/api/venues/${v.id}/enter`, { body: { pin: String(1000 + i) } })));
    expect(replies.filter((r) => r.status === 403)).toHaveLength(5); // exactly the free tries; every other guess found the PIN locked
    expect(replies.filter((r) => r.status === 429)).toHaveLength(25);
  });
});
