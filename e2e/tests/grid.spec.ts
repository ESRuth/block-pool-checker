import { expect, test, type Page } from "@playwright/test";
import { api, createSheet, settle, signIn, OWNER_CODE } from "./helpers";

const handles = (page: Page) => page.$$eval("circle.handle", (c) => c.map((x) => [Math.round(+x.getAttribute("cx")!), Math.round(+x.getAttribute("cy")!)]));

test("a corner dragged by touch stays on the photo, and Undo puts it back", async ({ page, context }) => {
  await signIn(page, OWNER_CODE);
  await createSheet(page);
  await page.getByRole("button", { name: "Show grid" }).click();
  await page.waitForSelector("circle.handle");
  const start = await handles(page);

  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const box = (await page.locator("circle.hit").nth(3).boundingBox())!;
  const [sx, sy] = [box.x + box.width / 2, box.y + box.height / 2];
  await touch("touchStart", sx, sy);
  for (let i = 1; i <= 10; i++) {
    await touch("touchMove", sx - 30 * i, sy + 40 * i);
    await page.waitForTimeout(20);
  } // far down and left, off the photo
  await touch("touchEnd", 0, 0);

  const [w, h] = await page
    .locator("svg.overlay, .photo-wrap svg")
    .first()
    .evaluate((el) => (el.getAttribute("viewBox") ?? "0 0 0 0").split(" ").slice(2).map(Number) as [number, number]);
  const moved = (await handles(page))[3]!;
  expect(moved[0]).toBeGreaterThanOrEqual(0);
  expect(moved[1]).toBeLessThanOrEqual(h);
  expect(moved[0]).toBeLessThanOrEqual(w);
  expect(moved).not.toEqual(start[3]);

  await page.getByRole("button", { name: "Undo" }).click();
  expect((await handles(page))[3]).toEqual(start[3]);
});

test("a corner that is already off the photo shows a banner, and Fix the grid brings it back", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  const { id } = await createSheet(page);
  await settle(page, id);
  const got = (await (await api(`/api/sheets/${id}`)).json()) as { doc: { corners: number[][] } & Record<string, unknown> };
  const doc = got.doc;
  doc.corners = [doc.corners[0]!, doc.corners[1]!, doc.corners[2]!, [-900, 2500]];
  expect((await api(`/api/sheets/${id}`, { method: "PUT", body: JSON.stringify(doc) })).ok).toBe(true);

  await page.goto(`/s/${id}`);
  await expect(page.getByText("A corner of the grid is outside the photo")).toBeVisible();
  await page.getByRole("button", { name: "Fix the grid" }).click();
  await expect(page.getByText("A corner of the grid is outside the photo")).toHaveCount(0);
  await expect(page.locator("circle.handle")).toHaveCount(4); // shown so the repair can be checked
});

test("a corner can be moved with the arrow keys, and Undo puts it back", async ({ page }) => {
  await signIn(page, OWNER_CODE);
  await createSheet(page);
  await page.getByRole("button", { name: "Show grid" }).click();
  await page.waitForSelector("circle.handle");
  const start = (await handles(page))[0]!;
  await page.getByRole("button", { name: /Move the top-left corner/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const moved = (await handles(page))[0]!;
  expect(moved[0]).toBeGreaterThan(start[0]);
  expect(moved[1]).toBeGreaterThan(start[1] + 5);
  await page.getByRole("button", { name: "Undo" }).click(); // the run of key presses is one undo step
  expect((await handles(page))[0]).toEqual(start);
});

test("while a corner is dragged a magnifier shows above the finger, and goes away on release", async ({ page, context }) => {
  await signIn(page, OWNER_CODE);
  await createSheet(page);
  await page.getByRole("button", { name: "Show grid" }).click();
  await page.waitForSelector("circle.handle");
  await expect(page.locator(".loupe")).toHaveCount(0);
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const box = (await page.locator("circle.hit").nth(2).boundingBox())!;
  const [sx, sy] = [box.x + box.width / 2, box.y + box.height / 2];
  await touch("touchStart", sx, sy);
  await touch("touchMove", sx - 10, sy - 10);
  await expect(page.locator(".loupe")).toBeVisible();
  const l = (await page.locator(".loupe").boundingBox())!;
  expect(l.y + l.height).toBeLessThan(sy); // above the finger, not under it
  await touch("touchEnd", 0, 0);
  await expect(page.locator(".loupe")).toHaveCount(0);
});
