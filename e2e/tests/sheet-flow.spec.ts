import { expect, test } from "@playwright/test";
import { createSheet, signIn, OWNER_CODE } from "./helpers";

test("make a sheet from a photo, then open it by view link, from My Sheets, and by edit link", async ({ page, browser }) => {
  await signIn(page, OWNER_CODE);
  const { id, token } = await createSheet(page);

  // The edit link: scoreboard, winners, who added it; the grid is hidden once saved.
  await expect(page.getByLabel("Winners")).toBeVisible();
  await expect(page.locator(".when")).toContainText("Added by Owner");
  // Every winning box carries its period number, so colour is never the only cue.
  await expect(page.locator("[data-tag]")).toHaveText(["1", "2", "3", "F"]);
  await expect(page.locator("circle.handle")).toHaveCount(0);

  // A stranger with only the view link sees the sheet but cannot edit it.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByLabel("Winners")).toBeVisible();
  await expect(stranger.getByRole("button", { name: "Show grid" })).toHaveCount(0);
  await expect(stranger.getByRole("tab", { name: "Edit" })).toHaveCount(0);

  // My Sheets lists it, and the owner opens it editable without the edit token.
  await page.goto("/");
  const card = page.locator(`a.sheetcard[href='/s/${id}']`);
  await expect(card).toContainText("Eagles vs Commanders");
  await card.click();
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();

  // The edit link still works in a clean browser.
  const editor = await (await browser.newContext()).newPage();
  await editor.goto(`/s/${id}#k=${token}`);
  await expect(editor.getByRole("tab", { name: "Edit" })).toBeVisible();
});

test("the wizard shows the grid; a saved sheet hides it until Show grid", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  await page.goto("/new");
  await page.locator("input[type=file]").setInputFiles((await import("./helpers")).SAMPLE);
  await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
  await expect(page.locator("circle.handle")).toHaveCount(4); // setting up: the grid is shown
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(/\/s\/.+#k=/);
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
    await page.getByRole("tab", { name: "Edit" }).click();
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
