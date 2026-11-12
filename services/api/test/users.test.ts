import { describe, expect, it } from "vitest";
import { EspnNfl } from "@bpc/scores";
import { MemorySheetPhotos, MemorySheetRepository, MemoryUserRepository, createApp } from "../src/index.js";

const team = (abbr: string, name: string) => ({ abbr, name: `${abbr} ${name}`, nickname: name });
const doc = {
  width: 100,
  height: 100,
  corners: [
    [1, 1],
    [90, 1],
    [90, 90],
    [1, 90],
  ],
  teams: { top: "Eagles", left: "Commanders" },
  mode: "shared",
  rows: { "shared.top": "0123456789", "shared.left": "0123456789" },
  game: { gameId: "g1", kickoff: "2026-11-01T18:00:00.000Z", status: "final", home: team("WSH", "Commanders"), away: team("PHI", "Eagles"), label: "Week 9" },
  finalIncludesOvertime: true,
  names: {},
  mine: [],
};
const setup = (dailyReadCap?: number) => {
  const users = new MemoryUserRepository();
  const app = createApp({
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
    users,
    inviteCode: "owner-code",
    dailyReadCap,
    reader: {
      read: async () => {
        throw new Error("n/a");
      },
      readGrid: async () => ({ names: [], model: "fake" }),
    },
  });
  const call = (path: string, key?: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
    app.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...(key ? { "X-Invite-Code": key } : {}) },
    });
  return { call, users };
};
type S = ReturnType<typeof setup>;
const invite = async (s: S, name: string) => (await (await s.call("/api/owner/users", "owner-code", { name })).json()) as any;
/** A person who runs a venue of their own, and a sheet they make on it. */
const runnerWithSheet = async (s: S, name: string) => {
  const person = await invite(s, name);
  const v = (await (await s.call("/api/owner/venues", "owner-code", { name: `${name}'s place`, pin: "4821", runnerIds: [person.id] })).json()) as any;
  const make = async (key = person.key) => (await s.call("/api/sheets", key, { venueId: v.id, doc })).json() as Promise<any>;
  return { person, venueId: v.id as string, make };
};

describe("personal invite keys", () => {
  it("the owner makes a key for a person; the key is shown once and only its hash is stored", async () => {
    const s = setup();
    const u = await invite(s, "Jordan");
    expect(u.key).toMatch(/\S{15,}/);
    expect(JSON.stringify(await s.users.list())).not.toContain(u.key);
    const list = (await (await s.call("/api/owner/users", "owner-code")).json()) as any;
    expect(list.users).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(u.key);
    expect(JSON.stringify(list)).not.toContain("keyHash");
  });

  it("a personal key identifies the person, but cannot use the owner pages", async () => {
    const s = setup();
    const u = await invite(s, "Jordan");
    expect(await (await s.call("/api/me", u.key)).json()).toEqual({ name: "Jordan", owner: false });
    expect(await (await s.call("/api/me", "owner-code")).json()).toEqual({ name: "Owner", owner: true });
    expect((await s.call("/api/me")).status).toBe(403);
    expect((await s.call("/api/me", "wrong")).status).toBe(403);
    expect((await s.call("/api/owner/users", u.key)).status).toBe(403);
    expect((await s.call("/api/owner/users", u.key, { name: "x" })).status).toBe(403);
  });

  it("sheets record who created and last changed them", async () => {
    const s = setup();
    const { person, make } = await runnerWithSheet(s, "Jordan");
    const made = await make();
    expect(made.createdBy).toBe("Jordan");
    const view = (await (await s.call(`/api/sheets/${made.id}`, person.key)).json()) as any;
    expect(view.createdBy).toBe("Jordan");
    expect((await s.call(`/api/sheets/${made.id}`, "owner-code", doc, "PUT")).status).toBe(200);
    expect(((await (await s.call(`/api/sheets/${made.id}`, person.key)).json()) as any).updatedBy).toBe("Owner");
    expect((await s.call(`/api/sheets/${made.id}`, undefined, doc, "PUT")).status).toBe(403); // no key, no change
  });

  it("uses are counted, and a revoked key stops working at once", async () => {
    const s = setup();
    const { person: u, venueId } = await runnerWithSheet(s, "Jordan");
    await s.call("/api/read-names", u.key, { image: "AAAA" });
    await s.call("/api/read-names", u.key, { image: "AAAA" });
    expect(((await (await s.call("/api/owner/users", "owner-code")).json()) as any).users[0].uses).toBe(2);
    expect((await s.call(`/api/owner/users/${u.id}/revoke`, "owner-code", {})).status).toBe(200);
    expect((await s.call("/api/me", u.key)).status).toBe(403);
    expect((await s.call("/api/sheets", u.key, { venueId, doc })).status).toBe(403);
  });
});

describe("My Sheets", () => {
  it("lists a person's own sheets; only they and the owner can edit them; others cannot", async () => {
    const s = setup();
    const a = await runnerWithSheet(s, "Jordan");
    const b = await runnerWithSheet(s, "Other");
    const made = await a.make();
    await b.make();
    const mine = (await (await s.call("/api/my/sheets", a.person.key)).json()) as any;
    expect(mine.sheets).toHaveLength(1);
    expect(mine.sheets[0]).toMatchObject({ id: made.id, teams: { top: "Eagles", left: "Commanders" } });
    expect((await s.call("/api/my/sheets")).status).toBe(403);
    const all = (await (await s.call("/api/my/sheets", "owner-code")).json()) as any;
    expect(all.sheets.map((x: any) => x.createdBy).sort()).toEqual(["Jordan", "Other"]); // the owner sees everyone's
    const open = async (key?: string) => s.call(`/api/sheets/${made.id}`, key);
    expect(((await (await open(a.person.key)).json()) as any).canEdit).toBe(true);
    expect(((await (await open("owner-code")).json()) as any).canEdit).toBe(true);
    expect((await open(b.person.key)).status).toBe(404); // a draft on someone else's venue does not exist for them
    expect((await open()).status).toBe(404);
    expect((await s.call(`/api/sheets/${made.id}`, a.person.key, doc, "PUT")).status).toBe(200);
    expect((await s.call(`/api/sheets/${made.id}`, b.person.key, doc, "PUT")).status).toBe(403);
  });
});

describe("My Sheets for the owner", () => {
  it("includes sheets saved before creators were recorded (and before every sheet was on a venue)", async () => {
    const sheets = new MemorySheetRepository();
    await sheets.put({
      id: "old",
      doc: { ...(doc as any), schema_version: 1 },
      hasPhoto: true,
      createdAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
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
      sheetPhotos: new MemorySheetPhotos(),
      users: new MemoryUserRepository(),
      inviteCode: "owner-code",
    });
    const res = await app.request("/api/my/sheets", { headers: { "X-Invite-Code": "owner-code" } });
    expect(((await res.json()) as any).sheets.map((s: any) => s.id)).toEqual(["old"]);
  });
});

describe("getting a link again", () => {
  it("the owner can make another link for a person; both links work; revoking turns all of them off; others cannot", async () => {
    const s = setup();
    const u = await invite(s, "Jordan");
    const again = (await (await s.call(`/api/owner/users/${u.id}/links`, "owner-code", {})).json()) as any;
    expect(again.key).toMatch(/\S{15,}/);
    expect(again.key).not.toBe(u.key);
    expect(await (await s.call("/api/me", again.key)).json()).toEqual({ name: "Jordan", owner: false });
    expect((await s.call("/api/me", u.key)).status).toBe(200); // the first link still works
    expect(JSON.stringify(await s.users.list())).not.toContain(again.key);
    expect((await s.call(`/api/owner/users/${u.id}/links`, u.key, {})).status).toBe(403);
    expect((await s.call(`/api/owner/users/nope/links`, "owner-code", {})).status).toBe(404);
    await s.call(`/api/owner/users/${u.id}/revoke`, "owner-code", {});
    expect((await s.call("/api/me", again.key)).status).toBe(403);
    expect((await s.call("/api/me", u.key)).status).toBe(403);
    expect((await s.call(`/api/owner/users/${u.id}/links`, "owner-code", {})).status).toBe(409);
  });
});

describe("daily read cap", () => {
  it("an invited person is stopped after the cap, the owner is not, and the next day starts fresh", async () => {
    const s = setup(2);
    const u = await invite(s, "Jordan");
    const names = (k: string) => s.call("/api/read-names", k, { image: "AQID" });
    expect((await names(u.key)).status).toBe(200);
    expect((await names(u.key)).status).toBe(200);
    const over = await names(u.key);
    expect(over.status).toBe(429);
    expect(((await over.json()) as any).error).toMatch(/today/);
    for (let i = 0; i < 4; i++) expect((await names("owner-code")).status).toBe(200);
    const rec = (await s.users.list())[0]!;
    await s.users.put({ ...rec, readDay: "2000-01-01" });
    expect((await names(u.key)).status).toBe(200);
  });
});

describe("renaming a person", () => {
  it("only the owner can; the new name shows for them and as 'Added by' on their sheets; bad names are refused", async () => {
    const s = setup();
    const { person, make } = await runnerWithSheet(s, "Speak");
    const made = await make();
    expect((await s.call(`/api/owner/users/${person.id}`, person.key, { name: "Sam" }, "PATCH")).status).toBe(403);
    expect((await s.call(`/api/owner/users/${person.id}`, undefined, { name: "Sam" }, "PATCH")).status).toBe(403);
    expect((await s.call(`/api/owner/users/${person.id}`, "owner-code", { name: "  " }, "PATCH")).status).toBe(400);
    expect((await s.call(`/api/owner/users/${person.id}`, "owner-code", { name: "x".repeat(41) }, "PATCH")).status).toBe(400);
    expect((await s.call(`/api/owner/users/nope`, "owner-code", { name: "Sam" }, "PATCH")).status).toBe(404);
    const r = await s.call(`/api/owner/users/${person.id}`, "owner-code", { name: "  Sam Rivera " }, "PATCH");
    expect(r.status).toBe(200);
    expect(await (await s.call("/api/me", person.key)).json()).toEqual({ name: "Sam Rivera", owner: false });
    const sheet = (await (await s.call(`/api/sheets/${made.id}`, "owner-code")).json()) as any;
    expect(sheet.createdBy).toBe("Sam Rivera");
    expect(sheet.updatedBy).toBe("Sam Rivera");
    const list = (await (await s.call("/api/owner/users", "owner-code")).json()) as any;
    expect(list.users.map((u: any) => u.name)).toEqual(["Sam Rivera"]);
    expect(JSON.stringify(list)).not.toContain("Speak");
  });
});

describe("replacing a link", () => {
  it("a replacement link is the only one that works; an extra link leaves the old ones working", async () => {
    const s = setup();
    const u = await invite(s, "Jordan");
    const extra = (await (await s.call(`/api/owner/users/${u.id}/links`, "owner-code", {})).json()) as any;
    expect((await s.call("/api/me", u.key)).status).toBe(200);
    expect((await s.call("/api/me", extra.key)).status).toBe(200);
    const fresh = (await (await s.call(`/api/owner/users/${u.id}/links`, "owner-code", { replace: true })).json()) as any;
    expect((await s.call("/api/me", fresh.key)).status).toBe(200);
    expect((await s.call("/api/me", u.key)).status).toBe(403); // the first link is dead
    expect((await s.call("/api/me", extra.key)).status).toBe(403); // so is the extra one
    expect((await s.call(`/api/owner/users/${u.id}/links`, u.key, { replace: true })).status).toBe(403); // owner only
  });

  it("the owner deletes the record of someone turned off, and only then; they stop running venues", async () => {
    const s = setup();
    const { person, venueId, make } = await runnerWithSheet(s, "Jordan");
    const made = await make();
    expect((await s.call(`/api/owner/users/${person.id}`, person.key, undefined, "DELETE")).status).toBe(403); // not the owner
    expect((await s.call(`/api/owner/users/${person.id}`, "owner-code", undefined, "DELETE")).status).toBe(409); // still has links
    await s.call(`/api/owner/users/${person.id}/revoke`, "owner-code", {});
    expect((await s.call(`/api/owner/users/${person.id}`, "owner-code", undefined, "DELETE")).status).toBe(204);
    expect((await s.call(`/api/owner/users/${person.id}`, "owner-code", undefined, "DELETE")).status).toBe(404);
    expect(((await (await s.call("/api/owner/users", "owner-code")).json()) as any).users).toHaveLength(0);
    const ran = (await (await s.call("/api/my/venues", "owner-code")).json()) as any;
    expect(ran.venues.find((v: any) => v.id === venueId).runnerIds).toEqual([]); // no longer runs it
    expect(((await (await s.call(`/api/sheets/${made.id}`, "owner-code")).json()) as any).createdBy).toBe("Jordan"); // "Added by" keeps the name
  });
});
