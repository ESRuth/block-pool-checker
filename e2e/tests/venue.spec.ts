import { expect, test } from "@playwright/test";
import { api, createSheet, SAMPLE, signIn, OWNER_CODE } from "./helpers";

test("post a sheet, add the photo, publish: viewers need the venue PIN and see no photo, the runner does", async ({ page, browser }) => {
  // The owner sets up a venue with a runner.
  const runner = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Riley" }) })).json()) as { id: string; key: string };
  const v = (await (
    await api("/api/owner/venues", { method: "POST", body: JSON.stringify({ name: "Test Lodge", pin: "4821", runnerIds: [runner.id] }) })
  ).json()) as {
    id: string;
  };
  const sheetLabel = /Eagles v Commanders \d+\/\d+ \$10/;

  // Stage 1, like the paper sheet on the wall: pick the game, say which team is across the top, and post it. It is open for blocks, with no photo yet.
  await signIn(page, runner.key);
  await page.goto(`/v/${v.id}`);
  await expect(page.getByRole("heading", { name: "Test Lodge" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code for Test Lodge/ })).toBeVisible();
  await page.getByRole("button", { name: "Post a new sheet" }).click();
  await page.locator(".games button", { hasText: "Demo: not started" }).click();
  await page.getByRole("button", { name: "Eagles across the top" }).click();
  await page.getByLabel("Tag (optional)").fill("$10");
  await page.getByRole("button", { name: "Post it" }).click();
  await expect(page.locator(".tag", { hasText: "Open for blocks" })).toBeVisible();

  // People with the PIN see that it exists and where to go, and nothing else: no link, no names.
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(`/v/${v.id}`);
  await expect(viewer.getByRole("heading", { name: "Test Lodge" })).toBeVisible();
  await expect(viewer.getByText("Commanders")).toHaveCount(0); // nothing before the PIN
  await viewer.getByLabel("PIN").fill("0000");
  await viewer.getByRole("button", { name: "Open" }).click();
  await expect(viewer.getByRole("alert")).toContainText("isn't right");
  await viewer.getByLabel("PIN").fill("4821");
  await viewer.getByRole("button", { name: "Open" }).click();
  await expect(viewer.getByText(sheetLabel)).toBeVisible();
  await expect(viewer.getByText("Ask at the venue to get a block")).toBeVisible();
  await expect(viewer.getByRole("link")).toHaveCount(2); // only "Help" and "Privacy": a viewer has no home page

  // Stage 2, once the digits are drawn: the runner opens the posted sheet and adds the photo. Game and teams are already known, so those questions are skipped.
  await page.getByRole("link", { name: sheetLabel }).click();
  await expect(page.getByLabel("Posted sheet")).toContainText("open for blocks");
  const id = /\/s\/([^#/]+)/.exec(page.url())![1]!;
  await page.getByRole("link", { name: "Add the photo (digits drawn)" }).click();
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible();
  await expect(page.getByText("Which game?")).toHaveCount(0);
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL((u) => u.pathname === `/s/${id}`);
  const sheetName = /^Eagles v Commanders \d+\/\d+ \$10$/;
  await expect(page.getByRole("heading", { name: sheetName })).toBeVisible();

  // Stage 3, draft: the runner is told, and viewers still just see "open for blocks".
  await expect(page.getByLabel("Draft")).toContainText("Only you and the other runners");
  await viewer.reload();
  await expect(viewer.getByText("Open for blocks")).toBeVisible();
  await expect(viewer.getByRole("link", { name: sheetLabel })).toHaveCount(0);
  await page.goto(`/v/${v.id}`);
  await expect(page.locator(".tag", { hasText: "Draft" })).toBeVisible();

  // Stage 4, published: viewers can open it.
  await page.goto(`/s/${id}`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await viewer.reload();
  await expect(viewer.getByText("Open for blocks")).toHaveCount(0);
  await viewer.getByRole("link", { name: sheetLabel }).click();

  // Viewers get the sheet (the game has not started, so no winners yet) but not the photo, and nothing to edit.
  await expect(viewer.getByRole("heading", { name: sheetName })).toBeVisible();
  await expect(viewer.getByText("Game not started")).toBeVisible();
  await expect(viewer.getByLabel("Your sheet")).toHaveCount(0);
  await expect(viewer.getByRole("tab", { name: "Edit" })).toHaveCount(0);

  // The same link on a phone with no pass asks for the PIN first.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByRole("heading", { name: sheetName })).toBeVisible();
  await expect(stranger.getByLabel("Winners")).toHaveCount(0);

  // The runner sees the photo, and can let viewers see it too.
  await expect(page.getByLabel("Your sheet")).toBeVisible();
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Let viewers see the photo").click();
  await expect(page.getByText("Viewers can see the photo.")).toBeVisible();
  await viewer.reload();
  await expect(viewer.getByLabel("Your sheet")).toBeVisible();

  // Changing the PIN signs the viewer out.
  expect((await api(`/api/venues/${v.id}`, { method: "PATCH", body: JSON.stringify({ pin: "9999" }), key: runner.key })).ok).toBe(true);
  await viewer.reload();
  await expect(viewer.getByLabel("PIN")).toBeVisible();
});

test("a deleted sheet stays in the list, marked, and can be restored from the sheet", async ({ page, browser }) => {
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page);
  await page.getByRole("button", { name: "Publish" }).click(); // so a stranger would have something to look for

  page.once("dialog", (d) => d.accept());
  await page.getByRole("tab", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Delete this sheet" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // Anyone else just finds nothing there.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByRole("heading", { name: "Sheet not found" })).toBeVisible();

  // The owner still sees it in the normal list, labelled in words, and opens it read-only.
  const card = page.locator(`a.sheetcard[href='/s/${id}']`);
  await expect(card).toContainText("Deleted");
  await expect(card).toContainText("Gone for good");
  await card.click();
  await expect(page.getByLabel("Deleted sheet")).toContainText("This sheet is deleted");
  await expect(page.getByRole("tab", { name: "Edit" })).toHaveCount(0);

  // Restoring puts it back as an ordinary sheet.
  await page.getByRole("button", { name: "Restore this sheet" }).click();
  await expect(page.getByLabel("Deleted sheet")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Edit" })).toBeVisible();
  await page.goto("/");
  await expect(page.locator(`a.sheetcard[href='/s/${id}']`)).not.toContainText("Deleted");
});

test("the help page opens without signing in and lists the guide's sections", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Running a venue" })).toBeVisible();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Watching a pool" }).click();
  await expect(page).toHaveURL(/#watch$/);
});

test("the privacy policy opens without signing in", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reading names with AI" })).toBeVisible();
});
