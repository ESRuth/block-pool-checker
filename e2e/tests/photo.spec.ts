import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { api, createSheet, settle, signIn, OWNER_CODE, SAMPLE } from "./helpers";

const OTHER = resolve(import.meta.dirname, "../../samples/eagles_chargers.jpg");
const doc = async (id: string) =>
  (
    (await (await api(`/api/sheets/${id}`)).json()) as {
      doc: { width: number; height: number; names: Record<string, { text: string; confirmed: boolean }>; mine: string[]; corners: number[][] };
    }
  ).doc;
const photoBytes = async (id: string) => Buffer.from(await (await api(`/api/sheets/${id}/photo`)).arrayBuffer());

test("a photo can be turned and cropped before it is read, and the sheet is made from the edited photo", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const venue = (await (await api("/api/owner/venues", { method: "POST", body: JSON.stringify({ name: "Prep Lodge", pin: "4821" }) })).json()) as {
    id: string;
  };
  await page.goto(`/new?venue=${venue.id}`);
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await expect(page.getByRole("heading", { name: "Is the sheet the right way up?" })).toBeVisible();
  await page.getByRole("button", { name: "Turn right" }).click();
  // crop: tab to the top-left corner and nudge it in with the arrow keys
  await page.getByRole("button", { name: /Crop: move the top-left corner/ }).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Reset crop" })).toBeEnabled();
  await page.getByRole("button", { name: "Use this photo as shown" }).click();
  await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
  await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(/\/s\/[^#]+$/);
  const id = /\/s\/([^#]+)$/.exec(page.url())![1]!;
  const d = await doc(id);
  expect(d.height).toBeGreaterThan(d.width); // the landscape sample was turned a quarter turn
  expect(d.width).toBeLessThan(1542); // ... and cropped from the left (a turned, uncropped sample is 1542 wide)
  await settle(page, id);
});

test("switching a photo and keeping the names: the picture changes, the names and digits stay, nothing is read again", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page);
  await settle(page, id);
  const before = await doc(id);
  const oldPhoto = await photoBytes(id);
  await page.goto(`/s/${id}`);
  await page.getByRole("tab", { name: "Details" }).click();
  await page.getByRole("link", { name: "Switch the photo" }).click();
  await page.locator("input[type=file]").setInputFiles(OTHER);
  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("heading", { name: "What should happen to the names and digits?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep my names and digits" }).click();
  await expect(page.getByText("Your digits and names are kept.")).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(new RegExp(`/s/${id}$`));
  await expect(page.getByText("Winners")).toBeVisible();
  const after = await doc(id);
  expect(Object.keys(after.names)).toHaveLength(100);
  expect(after.names["1,1"]).toEqual(before.names["1,1"]); // the names are untouched
  expect(after.corners).not.toEqual(before.corners); // the grid was re-fitted on the new photo
  expect((await photoBytes(id)).equals(oldPhoto)).toBe(false); // and the picture is the new one
});

test("switching a photo and reading it again: the new photo is read, names start over, marked blocks stay", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page);
  await settle(page, id);
  const d0 = await doc(id);
  d0.mine = ["2,2"];
  d0.names["1,1"] = { text: "My typed name", confirmed: true };
  expect((await api(`/api/sheets/${id}`, { method: "PUT", body: JSON.stringify(d0) })).ok).toBe(true);
  await page.goto(`/new?sheet=${id}&replace=1`);
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await page.getByRole("button", { name: "Use this photo" }).click();
  await page.getByRole("button", { name: "Read it again" }).click();
  await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(new RegExp(`/s/${id}$`));
  await expect.poll(async () => Object.keys((await doc(id)).names).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(100); // read again on opening
  const d1 = await doc(id);
  expect(d1.mine).toEqual(["2,2"]); // the marked block stayed
  expect(d1.names["1,1"]?.text).not.toBe("My typed name"); // the name is read fresh
});
