import { expect, test } from "@playwright/test";

const PAGES = ["/", "/plans", "/plans/new", "/cases", "/conversations", "/follow-ups", "/campaigns", "/campaigns/new?kind=reactivation", "/appointments", "/analytics", "/settings"];

for (const path of PAGES) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("case detail and mobile navigation work at this width", async ({ page }) => {
  await page.goto("/cases");
  await page.locator("main a[href^='/cases/']:visible").first().click();
  await expect(page.getByText("Next step", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const width = page.viewportSize()!.width;
  if (width < 1024) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Analytics" }).click();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  }
});
