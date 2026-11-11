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
  const call = (path: string, key?: string, body?: unknown, method = body === undefined ? "GET" : "POST", token?: string) =>
    app.request(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...(key ? { "X-Invite-Code": key } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  return { call, users };
};
const invite = async (s: ReturnType<typeof setup>, name: string) => (await (await s.call("/api/owner/users", "owner-code", { name })).json()) as any;

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
    const person = await invite(s, "Jordan");
    const made = (await (await s.call("/api/sheets", person.key, doc)).json()) as any;
    expect(made.createdBy).toBe("Jordan");
    const view = (await (await s.call(`/api/sheets/${made.id}`)).json()) as any;
    expect(view.createdBy).toBe("Jordan");
    const edit = (key?: string) => s.call(`/api/sheets/${made.id}`, key, doc, "PUT", made.editToken);
    expect((await edit("owner-code")).status).toBe(200);
    expect(((await (await s.call(`/api/sheets/${made.id}`)).json()) as any).updatedBy).toBe("Owner");
    await edit(); // an edit link used without any personal key credits nobody new
    expect(((await (await s.call(`/api/sheets/${made.id}`)).json()) as any).updatedBy).toBe("Owner");
  });

  it("uses are counted, and a revoked key stops working at once", async () => {
    const s = setup();
    const u = await invite(s, "Jordan");
    await s.call("/api/read-names", u.key, { image: "AAAA" });
    await s.call("/api/read-names", u.key, { image: "AAAA" });
    expect(((await (await s.call("/api/owner/users", "owner-code")).json()) as any).users[0].uses).toBe(2);
    expect((await s.call(`/api/owner/users/${u.id}/revoke`, "owner-code", {})).status).toBe(200);
    expect((await s.call("/api/me", u.key)).status).toBe(403);
    expect((await s.call("/api/sheets", u.key, doc)).status).toBe(403);
  });
});

describe("My Sheets", () => {
  it("lists a person's own sheets and lets them edit without the edit link; others cannot", async () => {
    const s = setup();
    const person = await invite(s, "Jordan");
    const other = await invite(s, "Other");
    const made = (await (await s.call("/api/sheets", person.key, doc)).json()) as any;
    await s.call("/api/sheets", other.key, doc);
    const mine = (await (await s.call("/api/my/sheets", person.key)).json()) as any;
    expect(mine.sheets).toHaveLength(1);
    expect(mine.sheets[0]).toMatchObject({ id: made.id, teams: { top: "Eagles", left: "Commanders" } });
    expect(JSON.stringify(mine)).not.toContain("editToken");
    expect((await s.call("/api/my/sheets")).status).toBe(403);
    const all = (await (await s.call("/api/my/sheets", "owner-code")).json()) as any;
    expect(all.sheets.map((x: any) => x.createdBy).sort()).toEqual(["Jordan", "Other"]); // the owner sees everyone's
    const canEdit = async (key?: string) => ((await (await s.call(`/api/sheets/${made.id}`, key)).json()) as any).canEdit;
    expect(await canEdit(person.key)).toBe(true);
    expect(await canEdit("owner-code")).toBe(true);
    expect(await canEdit(other.key)).toBe(false);
    expect(await canEdit()).toBe(false);
    expect((await s.call(`/api/sheets/${made.id}`, person.key, doc, "PUT")).status).toBe(200);
    expect((await s.call(`/api/sheets/${made.id}`, other.key, doc, "PUT")).status).toBe(403);
  });
});

describe("My Sheets for the owner", () => {
  it("includes sheets saved before creators were recorded", async () => {
    const sheets = new MemorySheetRepository();
    await sheets.put({
      id: "old",
      editTokenHash: "x",
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

describe("making an edit link later", () => {
  it("the creator can make a new edit link; it works, older links keep working, others cannot make one", async () => {
    const s = setup();
    const person = await invite(s, "Jordan");
    const other = await invite(s, "Other");
    const made = (await (await s.call("/api/sheets", person.key, doc)).json()) as any;
    expect((await s.call(`/api/sheets/${made.id}/edit-links`, other.key, {})).status).toBe(403);
    expect((await s.call(`/api/sheets/${made.id}/edit-links`, undefined, {})).status).toBe(403);
    const mk = (await (await s.call(`/api/sheets/${made.id}/edit-links`, person.key, {})).json()) as any;
    expect(mk.editToken).toMatch(/\S{20,}/);
    const put = (token: string) => s.call(`/api/sheets/${made.id}`, undefined, doc, "PUT", token);
    expect((await put(mk.editToken)).status).toBe(200); // the new link edits with no personal key
    expect((await put(made.editToken)).status).toBe(200); // the original still works
    expect((await put("nope")).status).toBe(403);
    expect((await s.call(`/api/sheets/${made.id}/edit-links`, "owner-code", {})).status).toBe(201); // the owner can too
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
