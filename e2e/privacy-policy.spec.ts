import { expect, test } from "@playwright/test";

test("renders the browser-local privacy policy with its complete table of contents", async ({
  page,
}) => {
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Privacy at a glance")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to NestlyPDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: "15. Contact" })).toBeVisible();
  await expect(page.getByText("Last updated: August 27, 2026")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("keeps the privacy policy usable without horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Privacy policy contents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Overview" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("keeps the privacy policy readable at a tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Privacy at a glance")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Privacy policy contents" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
