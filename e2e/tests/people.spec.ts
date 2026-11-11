import { expect, test } from "@playwright/test";
import { api, createSheet, makeVenue, signIn, OWNER_CODE } from "./helpers";

test("an invited person joins by link, runs a venue, sees only their own sheets, and can be turned off", async ({ page, browser }) => {
  // The owner makes a sheet and invites someone, who will run a venue of their own.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, OWNER_CODE);
  const { id: ownersSheet } = await createSheet(owner);
  const made = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Jordan" }) })).json()) as { id: string; key: string };
  const theirVenue = await makeVenue([made.id], "Jordan's place");

  // Their personal link signs them in and says who they are.
  await page.goto(`/join#c=${made.key}`);
  await expect(page.getByRole("heading", { name: "You're in, Jordan." })).toBeVisible();
  await page.getByRole("link", { name: "Open my venues" }).click();
  await expect(page.getByRole("heading", { name: "My venues" })).toBeVisible();
  await expect(page.locator("a.sheetcard:not([href^='/v/'])")).toHaveCount(0); // the owner's sheet is not theirs
  await expect(page.getByText("Jordan's place")).toBeVisible(); // but the venue they run is

  // They make their own; now they see exactly that one, and the owner sees both with who added each.
  const { id: theirs } = await createSheet(page, theirVenue);
  await page.goto("/");
  await expect(page.locator("a.sheetcard:not([href^='/v/'])")).toHaveCount(1);
  await expect(page.locator(`a.sheetcard[href='/s/${theirs}']`)).toBeVisible();
  const all = (await (await api("/api/my/sheets")).json()) as { sheets: Array<{ id: string; createdBy: string }> };
  const byId = Object.fromEntries(all.sheets.map((s) => [s.id, s.createdBy]));
  expect(byId[ownersSheet]).toBe("Owner");
  expect(byId[theirs]).toBe("Jordan");

  // They cannot reach the owner page data.
  expect((await api("/api/owner/users", { key: made.key })).status).toBe(403);

  // Turned off: their key stops working at once.
  expect((await api(`/api/owner/users/${made.id}/revoke`, { method: "POST", body: "{}" })).ok).toBe(true);
  expect((await api("/api/me", { key: made.key })).status).toBe(403);
});

test("a mistyped owner code on the owner page does not sign a person out", async ({ page }) => {
  const made = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Riley" }) })).json()) as { key: string };
  await signIn(page, made.key);
  await page.goto("/owner");
  await page.getByLabel("Owner code").fill("not-the-owner-code");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("That is not the owner code")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My venues" })).toBeVisible(); // still signed in as Riley
  await expect(page.getByText("Signed in as Riley")).toBeVisible();
});
