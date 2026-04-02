import { test, expect } from "@playwright/test";

test.describe("Predictive Lead Flow", () => {
  test("prospects page shows AI score pipeline", async ({ page }) => {
    await page.goto("/sales-funnel/prospects");
    await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(3000);

    await expect(page.getByRole("columnheader", { name: /AI Score/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("dialer queue panel renders", async ({ page }) => {
    await page.goto("/dialer");
    await expect(page.getByRole("heading", { name: "Dialer" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: "Dial Queue" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("today dashboard renders core action surfaces", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByPlaceholder("Find lead, address, APN, or phone..."),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);

    const actionSurface = page.getByText("Tasks").or(
      page.getByText("Overdue"),
    );
    await expect(actionSurface.first()).toBeVisible({ timeout: 10_000 });
  });

  test("prospects list exposes score labels when rows exist", async ({ page }) => {
    await page.goto("/sales-funnel/prospects");
    await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects rows available");

    const scoreLabels = page.locator("text=HIGH").or(
      page.locator("text=MED"),
    ).or(
      page.locator("text=LOW"),
    );
    await expect(scoreLabels.first()).toBeVisible({ timeout: 10_000 });
  });
});
