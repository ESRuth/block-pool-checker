import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { api, createSheet, makeVenue, SAMPLE, signIn, OWNER_CODE } from "./helpers";

/** Every screen, as each kind of person, in light and dark mode, must have no automatically detectable accessibility problems. */
const problems: string[] = [];
async function scan(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  for (const v of r.violations)
    for (const n of v.nodes.slice(0, 3))
      problems.push(`${what}: ${v.id} (${v.impact}) ${n.target.join(" ")} :: ${(n.any[0]?.message ?? n.failureSummary ?? "").split("\n")[0]}`);
}
test.afterEach(() => {
  expect(problems.splice(0)).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme, actionTimeout: 10_000 });

    test("the owner's pages", async ({ page }) => {
      await signIn(page, OWNER_CODE);
      const { id, venueId } = await createSheet(page);
      await expect(page.getByText("Winners")).toBeVisible();
      await scan(page, "sheet (draft)");
      for (const tab of ["Names", "Details", "Access", "Help"]) {
        await page.getByRole("tab", { name: tab }).click();
        await scan(page, `sheet tab ${tab}`);
      }
      await page.goto(`/v/${venueId}`);
      await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
      await scan(page, "venue (runner view)");
      for (const path of ["/", "/sheets", "/people", "/help", "/privacy"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await scan(page, path);
      }
      void id;
    });

    test("more states: the open menu, the new-sheet steps, people, a deleted sheet, a viewer's list and sheet", async ({ page, browser }) => {
      test.setTimeout(120_000);
      await signIn(page, OWNER_CODE);
      // the new-sheet flow: the grid step
      const venueId = await makeVenue([], "Elks Lodge");
      await page.goto(`/new?venue=${encodeURIComponent(venueId)}`);
      await scan(page, "new sheet: choose a photo");
      await page.locator("input[type=file]").setInputFiles(SAMPLE);
      await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
      await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible();
      await scan(page, "new sheet: the grid step");
      await page.getByRole("button", { name: /Looks right/ }).click();
      await page.waitForURL(/\/s\/[^#]+$/);
      const sheetId = /\/s\/([^#]+)$/.exec(page.url())![1]!;
      await expect(page.getByText("Winners")).toBeVisible();
      await page.getByRole("button", { name: "Show grid" }).click();
      await scan(page, "sheet with the grid and corner handles");
      await page.getByRole("tab", { name: "Access" }).click();
      await scan(page, "access tab");
      // publish, then the menu, people with a link shown, and a deleted sheet
      await page.getByRole("tab", { name: "Blocks" }).click();
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByText("Draft.")).toHaveCount(0); // wait for it to be saved before going on
      await page.locator(".appbar summary").click();
      await scan(page, "the open menu");
      await page.keyboard.press("Escape");
      const made = (await (await api("/api/owner/users", { method: "POST", body: JSON.stringify({ name: "Jordan" }) })).json()) as { id: string };
      await page.goto("/people");
      await page.locator(`#person-${made.id}`).getByRole("button", { name: "Another link" }).click();
      await scan(page, "people with a link shown");
      await page.locator(`#person-${made.id}`).getByRole("button", { name: "Rename" }).click();
      await scan(page, "people: renaming");
      await api(`/api/sheets/${sheetId}`, { method: "DELETE" });
      await page.goto(`/s/${sheetId}`);
      await expect(page.getByText(/deleted/i).first()).toBeVisible();
      await scan(page, "a deleted sheet");
      await api(`/api/sheets/${sheetId}/restore`, { method: "POST", body: "{}" });
      // a viewer: enters the PIN, sees the list and the sheet
      const viewer = await (await browser.newContext({ colorScheme: scheme })).newPage();
      await viewer.goto(`/v/${venueId}`);
      await viewer.getByLabel(/PIN/).fill("4821");
      await viewer.getByRole("button", { name: /Open|Continue|Enter|Go/ }).click();
      await expect(viewer.getByRole("heading", { name: "Elks Lodge" })).toBeVisible();
      await scan(viewer, "a viewer's venue list");
      await viewer.locator("a.sheetcard").first().click();
      await expect(viewer.getByText("Winners")).toBeVisible();
      await scan(viewer, "a viewer's sheet");
      await viewer.goto(`/v/${venueId}`);
      await viewer
        .getByLabel(/PIN/)
        .fill("1111")
        .catch(() => undefined);
    });

    test("a viewer, and signed out", async ({ page, browser }) => {
      const venueId = await makeVenue();
      void browser;
      await page.goto(`/v/${venueId}`);
      await expect(page.getByLabel(/PIN/)).toBeVisible();
      await scan(page, "PIN gate");
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await scan(page, "sign in");
      await api("/api/health");
    });
  });
}
