import { expect, test } from "@playwright/test";
import { api, createSheet, makeVenue, SAMPLE, signIn, OWNER_CODE } from "./helpers";

test("post a sheet, add the photo, publish: viewers need the venue PIN and see no photo, the runner does", async ({ page, browser }) => {
  // The owner sets up a venue with a runner.
  const runner = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Riley" }) })).json()) as { id: string; key: string };
  const v = (await (
    await api("/api/owner/venues", { method: "POST", body: JSON.stringify({ name: "Test Lodge", pin: "4821", runnerIds: [runner.id] }) })
  ).json()) as {
    id: string;
  };
  const sheetLabel = /Eagles vs Commanders · \$10/;

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
  await expect(viewer.getByText("see the venue to get one")).toBeVisible(); // said once, above the list
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
  const sheetName = /^Eagles vs Commanders · \$10$/;
  await expect(page.getByRole("heading", { name: sheetName })).toBeVisible();

  // Stage 3, draft: the runner is told, and viewers still just see "open for blocks".
  await expect(page.getByLabel("Draft")).toContainText("Only you and the other runners");
  await viewer.reload();
  await expect(viewer.locator(".tag", { hasText: "Open for blocks" })).toBeVisible();
  // The lines of the row stack: status, then name, then the day, all against the left edge, at phone width and on a desktop screen.
  for (const size of [
    { width: 412, height: 800 },
    { width: 1280, height: 800 },
  ]) {
    await viewer.setViewportSize(size);
    const tag = (await viewer.locator(".sheetcard .tag").boundingBox())!;
    const name = (await viewer.locator(".sheetcard b").boundingBox())!;
    const day = (await viewer.locator(".sheetcard .sub").boundingBox())!;
    expect(name.y).toBeGreaterThan(tag.y + tag.height - 2); // the name is below the status, not beside it
    expect(day.y).toBeGreaterThan(name.y);
    expect(Math.abs(name.x - tag.x)).toBeLessThan(3);
  }
  await expect(viewer.getByRole("link", { name: sheetLabel })).toHaveCount(0);
  await page.goto(`/v/${v.id}`);
  await expect(page.locator(".tag", { hasText: "Draft" })).toBeVisible();

  // Stage 4, published: viewers can open it.
  await page.goto(`/s/${id}`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByLabel("Draft")).toHaveCount(0);
  await viewer.reload();
  await expect(viewer.locator(".tag", { hasText: "Open for blocks" })).toHaveCount(0);
  await viewer.getByRole("link", { name: sheetLabel }).click();

  // Viewers get the sheet (the game has not started, so no winners yet) but not the photo, and nothing to edit.
  await expect(viewer.getByRole("heading", { name: sheetName })).toBeVisible();
  await expect(viewer.getByText("Game not started")).toBeVisible();
  await expect(viewer.getByLabel("Your sheet")).toHaveCount(0);
  await expect(viewer.getByRole("tab", { name: "Details" })).toHaveCount(0);

  // The same link on a phone with no pass asks for the PIN first.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByRole("heading", { name: "This sheet has a PIN" })).toBeVisible(); // nothing about the sheet is shown before the PIN
  await expect(stranger.getByLabel("Winners")).toHaveCount(0);

  // The runner sees the photo, and can let viewers see it too.
  await expect(page.getByLabel("Your sheet")).toBeVisible();
  await page.getByRole("tab", { name: "Access" }).click();
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
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("button", { name: "Delete this sheet" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/v/")); // deleting takes you back to the venue

  // Anyone else just finds nothing there.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/s/${id}`);
  await expect(stranger.getByRole("heading", { name: "Sheet not found" })).toBeVisible();

  // The venue's list still shows it to the people who run it, labelled in words; the owner's Sheets tab says when it goes for good.
  await expect(page.locator(`a.sheetcard[href='/s/${id}']`)).toContainText("Deleted");
  await page.getByRole("link", { name: "Sheets" }).click();
  const card = page.locator(`a.sheetcard[href='/s/${id}']`);
  await expect(card).toContainText("Deleted");
  await expect(card).toContainText("Gone for good");
  await card.click(); // and it opens read-only
  await expect(page.getByLabel("Deleted sheet")).toContainText("This sheet is deleted");
  await expect(page.getByRole("tab", { name: "Details" })).toHaveCount(0);

  // Restoring puts it back as an ordinary sheet.
  await page.getByRole("button", { name: "Restore this sheet" }).click();
  await expect(page.getByLabel("Deleted sheet")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Details" })).toBeVisible();
  await page.getByRole("link", { name: "Sheets" }).click();
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

test("a runner can show the PIN, and a viewer has no way to", async ({ page, browser }) => {
  const runner = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Riley" }) })).json()) as { id: string; key: string };
  const venue = await makeVenue([runner.id]);
  await signIn(page, runner.key);
  await page.goto(`/v/${venue}`);
  await page.getByRole("button", { name: "Show PIN" }).click();
  await expect(page.locator(".pinvalue")).toHaveText("4821");
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.locator(".pinvalue")).toHaveCount(0);

  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(`/v/${venue}`);
  await viewer.getByLabel("PIN").fill("4821");
  await viewer.getByRole("button", { name: "Open" }).click();
  await expect(viewer.getByRole("button", { name: "Show PIN" })).toHaveCount(0);
  expect((await api(`/api/venues/${venue}/pin`, { key: "" })).status).toBe(403);
});

test("the owner can move a sheet to another venue, where it lands as a draft", async ({ page }) => {
  const from = await makeVenue([], "First place");
  const to = await makeVenue([], "Second place");
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page, from);
  await page.getByRole("tab", { name: "Access" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator(".settings select").selectOption({ label: "Second place" });
  await page.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Moved to Second place.")).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click(); // the back arrow now goes to the new venue
  await expect(page).toHaveURL(new RegExp(`/v/${to}`));
  await expect(page.locator(`a.sheetcard[href='/s/${id}']`)).toContainText("Draft");
});

test("a posted sheet can be fixed in place: its tag, which team is on top, and its game", async ({ page }) => {
  const venue = await makeVenue([]);
  await signIn(page, OWNER_CODE);
  await page.goto(`/v/${venue}`);
  await page.getByRole("button", { name: "Post a new sheet" }).click();
  await page.locator(".games button", { hasText: "Demo: not started" }).click();
  await page.getByRole("button", { name: "Eagles across the top" }).click();
  await page.getByLabel("Tag (optional)").fill("$5");
  await page.getByRole("button", { name: "Post it" }).click();
  await page.getByRole("link", { name: /Eagles vs Commanders · \$5/ }).click();
  await expect(page.getByLabel("Details")).toBeVisible();

  // The tag, saved without leaving the page; the heading follows it.
  await page.getByLabel("Tag (optional)").fill("$10");
  await page.getByRole("button", { name: "Save tag" }).click();
  await expect(page.getByRole("heading", { name: "Eagles vs Commanders · $10" })).toBeVisible();

  // Which team is across the top: swap, and the name follows.
  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/api\/sheets\/[^/]+$/.test(r.url())); // edits save by themselves a moment later
  await page.getByRole("button", { name: "Swap top and left" }).click();
  await expect(page.getByRole("heading", { name: "Commanders vs Eagles · $10" })).toBeVisible();

  // The game can be changed too, and it is still posted (no photo, no digits to fix).
  await page.getByRole("button", { name: "Change the game" }).click();
  await expect(page.getByText("Which game?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Posted sheet")).toContainText("open for blocks");
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Commanders vs Eagles · $10" })).toBeVisible(); // it was saved
});

test("a runner can unlock a PIN locked by wrong tries without changing it", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const { venueId } = await createSheet(page);
  for (let i = 0; i < 5; i++) await api(`/api/venues/${venueId}/enter`, { method: "POST", body: JSON.stringify({ pin: "0000" }) });
  await page.goto(`/v/${venueId}`);
  await expect(page.getByText(/5 wrong PIN tries in a row/)).toBeVisible();
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText(/Unlocked/)).toBeVisible();
  await expect(page.getByText(/wrong PIN tries in a row/)).toHaveCount(0);
});
