import { expect, test } from "@playwright/test";
import { createSheet, makeVenue, SAMPLE, signIn, OWNER_CODE } from "./helpers";

test("make a sheet from a photo on a venue: it is a draft, then published behind the PIN; Home lists it", async ({ page, browser }) => {
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page);

  // The runner sees scoreboard, winners, who added it, and the draft bar; the grid is hidden once saved.
  await expect(page.getByLabel("Winners")).toBeVisible();
  await expect(page.locator(".when")).toContainText("Added by Owner");
  await expect(page.getByLabel("Draft")).toBeVisible();
  // Every winning box carries its period number, so colour is never the only cue.
  await expect(page.locator("[data-tag]")).toHaveText(["1", "2", "3", "F"]);
  await expect(page.locator("circle.handle")).toHaveCount(0);

  // A stranger finds nothing while it is a draft, and only a PIN prompt once it is published; they never get editing.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByRole("heading", { name: "Sheet not found" })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByLabel("PIN")).toBeVisible();
  await expect(stranger.getByRole("tab", { name: "Details" })).toHaveCount(0);

  // Home lists it, and the owner opens it editable.
  await page.getByRole("link", { name: "Sheets" }).click(); // the owner's Sheets tab
  const card = page.locator(`a.sheetcard[href='/s/${id}']`);
  await expect(card).toContainText("Eagles vs Commanders");
  await card.click();
  await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Access" })).toBeVisible();
});

test("the wizard shows the grid; a saved sheet hides it until Show grid", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  await page.goto(`/new?venue=${encodeURIComponent(await makeVenue())}`);
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
  await expect(page.locator("circle.handle")).toHaveCount(4); // setting up: the grid is shown
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(/\/s\/[^#]+$/);
  await expect(page.getByLabel("Winners")).toBeVisible();
  await expect(page.locator("circle.handle")).toHaveCount(0); // saved: hidden by default
  await page.getByRole("button", { name: "Show grid" }).click();
  await expect(page.locator("circle.handle")).toHaveCount(4);
  await page.getByRole("button", { name: "Hide grid" }).click();
  await expect(page.locator("circle.handle")).toHaveCount(0);
});

test("the demo games show each state: live, halftime, not started, overtime", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  await createSheet(page);
  const show = async (label: string) => {
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByRole("button", { name: "Change the game" }).click();
    await page.locator(".games button", { hasText: label }).click();
  };

  await show("Demo: live");
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  await expect(page.locator(".detail-text")).toContainText("3rd Quarter");
  await expect(page.locator("[data-tag]")).toHaveText(["1", "2", "3"]); // periods 1 and 2 are official, 3 is "currently winning" and not final

  // Who leads now, and who would lead after the next score, with the team with the ball listed first.
  const next = page.getByRole("region", { name: "What could happen next" });
  await expect(next).toContainText("have the ball (2nd & 7 at PHI 34)");
  await expect(next.locator("h3").first()).toContainText("(with the ball)");
  await expect(next.locator("li").first()).toContainText("a field goal");

  await show("Demo: halftime");
  await expect(page.getByRole("region", { name: "What could happen next" })).toHaveCount(0);
  await expect(page.locator(".detail-text")).toContainText("Halftime");

  await show("Demo: not started");
  await expect(page.getByRole("status").filter({ hasText: "Game not started" })).toBeVisible();
  await expect(page.locator("[data-tag]")).toHaveCount(0);

  await show("Demo: final in overtime");
  await expect(page.getByRole("status").filter({ hasText: "Final" })).toBeVisible();
});
