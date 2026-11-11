import { expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

export const OWNER_CODE = "e2e-owner-code";
export const SAMPLE = resolve(import.meta.dirname, "../../samples/eagles_commanders.jpg");

/** Sign this browser in with a personal key or the owner code, as opening a personal link would. */
export async function signIn(page: Page, key: string) {
  await page.goto("/");
  await page.evaluate((k) => localStorage.setItem("bpc.key", k), key);
}

/** Make a sheet through the real new-sheet flow with the sample photo. Returns where it landed. */
export async function createSheet(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Add a sheet from a photo" }).click();
  await page.locator("input[type=file]").setInputFiles(SAMPLE);
  await page.locator(".games button", { hasText: "PHI @ WSH" }).first().click();
  await expect(page.getByText("Do the lines sit on the blocks?")).toBeVisible();
  await page.getByRole("button", { name: /Looks right/ }).click();
  await page.waitForURL(/\/s\/.+#k=/);
  const m = /\/s\/([^#]+)#k=(.+)$/.exec(page.url())!;
  return { id: m[1]!, token: m[2]! };
}

export const api = (path: string, init: RequestInit & { key?: string; token?: string } = {}) => {
  const { key = OWNER_CODE, token, ...rest } = init;
  return fetch(`http://localhost:8090${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", "X-Invite-Code": key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers as object) },
  });
};

/** Wait until the page's own background saving (the name reading) has finished, then leave the page, so a direct edit is not overwritten. */
export async function settle(page: Page, id: string, token: string) {
  await expect
    .poll(async () => Object.keys(((await (await api(`/api/sheets/${id}`, { token })).json()) as { doc: { names: object } }).doc.names).length, {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(100);
  await page.goto("about:blank");
}
