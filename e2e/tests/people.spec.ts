import { expect, test } from "@playwright/test";
import { api, createSheet, signIn, OWNER_CODE } from "./helpers";

test("an invited person joins by link, sees only their own sheets, and can be turned off", async ({ page, browser }) => {
  // The owner makes a sheet and invites someone.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, OWNER_CODE);
  const { id: ownersSheet } = await createSheet(owner);
  const made = (await (await api("/api/admin/users", { method: "POST", body: JSON.stringify({ name: "Skyes" }) })).json()) as { id: string; key: string };

  // Their personal link signs them in and says who they are.
  await page.goto(`/join#c=${made.key}`);
  await expect(page.getByRole("heading", { name: "You're in, Skyes." })).toBeVisible();
  await page.getByRole("link", { name: "Open My Sheets" }).click();
  await expect(page.getByRole("heading", { name: "My Sheets" })).toBeVisible();
  await expect(page.locator("a.sheetcard")).toHaveCount(0); // the owner's sheet is not theirs

  // They make their own; now they see exactly that one, and the owner sees both with who added each.
  const { id: theirs } = await createSheet(page);
  await page.goto("/");
  await expect(page.locator("a.sheetcard")).toHaveCount(1);
  await expect(page.locator(`a.sheetcard[href='/s/${theirs}']`)).toBeVisible();
  const all = (await (await api("/api/my/sheets")).json()) as { sheets: Array<{ id: string; createdBy: string }> };
  const byId = Object.fromEntries(all.sheets.map((s) => [s.id, s.createdBy]));
  expect(byId[ownersSheet]).toBe("Owner");
  expect(byId[theirs]).toBe("Skyes");

  // They cannot reach the owner's admin page data.
  expect((await api("/api/admin/users", { key: made.key })).status).toBe(403);

  // Turned off: their key stops working at once.
  expect((await api(`/api/admin/users/${made.id}/revoke`, { method: "POST", body: "{}" })).ok).toBe(true);
  expect((await api("/api/me", { key: made.key })).status).toBe(403);
});
