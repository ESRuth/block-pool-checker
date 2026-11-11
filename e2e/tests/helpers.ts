import { expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

export const OWNER_CODE = "e2e-owner-code";
export const SAMPLE = resolve(import.meta.dirname, "../../samples/eagles_commanders.jpg");

/** Sign this browser in with a personal key or the owner code, as opening a personal link would. */
export async function signIn(page: Page, key: string) {
  await page.goto("/");
  await page.evaluate((k) => localStorage.setItem("bpc.key", k), key);
}

/** The owner makes a venue (PIN 4821) with these runners, through the API. Returns its id. */
export async function makeVenue(runnerIds: string[] = [], name = "Test Lodge") {
  const v = (await (await api("/api/owner/venues", { method: "POST", body: JSON.stringify({ name, pin: "4821", runnerIds }) })).json()) as { id: string };
  return v.id;
}

/** Make a sheet on a venue through the real new-sheet flow with the sample photo (it starts as a draft). Returns where it landed. */
export async function createSheet(page: Page, venueId?: string) {
  const venue = venueId ?? (await makeVenue());
  await page.goto(`/new?venue=${encodeURIComponent(venue)}`);
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
  await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(/\/s\/[^#]+$/);
  return { id: /\/s\/([^#]+)$/.exec(page.url())![1]!, venueId: venue };
}

export const api = (path: string, init: RequestInit & { key?: string } = {}) => {
  const { key = OWNER_CODE, ...rest } = init;
  return fetch(`http://localhost:8090${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", "X-Invite-Code": key, ...(rest.headers as object) },
  });
};

/** Wait until the page's own background saving (the name reading) has finished, then leave the page, so a direct edit is not overwritten. */
export async function settle(page: Page, id: string) {
  await expect
    .poll(async () => Object.keys(((await (await api(`/api/sheets/${id}`)).json()) as { doc: { names: object } }).doc.names).length, {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(100);
  await page.goto("about:blank");
}
