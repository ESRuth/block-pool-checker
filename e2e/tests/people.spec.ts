import { expect, test } from "@playwright/test";
import { api, createSheet, makeVenue, signIn, OWNER_CODE } from "./helpers";

test("an invited person joins by link, runs a venue, sees only their own sheets, and can be turned off", async ({ page, browser }) => {
  // The owner makes a sheet and invites someone, who will run a venue of their own.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, OWNER_CODE);
  const { id: ownersSheet } = await createSheet(owner);
  const made = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Jordan" }) })).json()) as { id: string; key: string };
  const theirVenue = await makeVenue([made.id], "Jordan's place");

  // Their personal link signs them in and goes straight to the one venue they run: nothing to click, and the key leaves the address bar.
  await page.goto(`/join#c=${made.key}`);
  await expect(page.getByRole("heading", { name: "Jordan's place" })).toBeVisible();
  await expect(page).toHaveURL(/\/v\/[^#]+$/);
  await expect(page.locator(".appbar summary")).toHaveText("Jordan"); // who they are, in the bar
  await expect(page.locator("a.sheetcard")).toHaveCount(0); // the owner's sheet is not on their venue

  // They make their own; their venue lists exactly that one, and the owner sees both with who added each.
  const { id: theirs } = await createSheet(page, theirVenue);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.locator("a.sheetcard")).toHaveCount(1);
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

test("a mistyped owner code does not sign a person out, and the owner pages say who they are for", async ({ page }) => {
  const made = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Riley" }) })).json()) as { key: string };
  await signIn(page, made.key);
  await page.goto("/people");
  await expect(page.getByText("This page is for the owner. You are signed in as Riley.")).toBeVisible();
  await page.getByRole("link", { name: "Use the owner code" }).click();
  await page.getByLabel("Access code").fill("not-the-owner-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code didn't work. You are still signed in as before.")).toBeVisible();
  await page.getByRole("link", { name: "Block Pool Checker" }).click(); // still signed in as Riley
  await expect(page.getByRole("heading", { name: "My venues" })).toBeVisible();
  await expect(page.getByText("Riley")).toBeVisible();
});

test("moving between pages does not reload the app, so nobody is asked to sign in again", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const { id, venueId } = await createSheet(page);
  await page.getByRole("link", { name: "Back" }).click(); // sheet -> its venue
  await expect(page).toHaveURL(new RegExp(`/v/${venueId}`));
  await page.evaluate(() => ((window as unknown as { marker: string }).marker = "still here")); // a reload would wipe this
  await page.getByRole("link", { name: "Sheets" }).click();
  await expect(page.locator(`a.sheetcard[href='/s/${id}']`)).toBeVisible();
  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await page.getByRole("link", { name: "Venues" }).click();
  await expect(page.getByRole("heading", { name: "Venues" })).toBeVisible();
  await page.goBack(); // the back button works inside the app
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe("still here");
  await expect(page.getByText("Owner")).toBeVisible();
});
