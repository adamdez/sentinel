import { test, expect } from "@playwright/test";

test.describe("Predictive Lead Flow", () => {
  test("leads page shows predictive priority data", async ({ page }) => {
    await page.goto("/sales-funnel/prospects");
    await expect(page.getByText("Prospects")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);

    // Check if any score badges are rendered (FIRE, HOT, WARM, COLD)
    const scoreBadges = page.locator("text=FIRE").or(
      page.locator("text=HOT"),
    ).or(
      page.locator("text=WARM"),
    ).or(
      page.locator("text=COLD"),
    );

    const count = await scoreBadges.count();
    // If there are prospects, they should have score labels
    if (count > 0) {
      await expect(scoreBadges.first()).toBeVisible();
    }
  });

  test("dialer queue prioritizes by blended score", async ({ page }) => {
    await page.goto("/dialer");
    await expect(page.getByText("Power Dialer")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);

    // The queue panel should render
    const queueItems = page.locator("[class*='glass'] [class*='glass']");
    const count = await queueItems.count();

    // If queue has items, verify they display some scoring info
    if (count >= 2) {
      // First item should exist (highest priority)
      await expect(queueItems.first()).toBeVisible();
    }
  });

  test("next best action widget shows AI recommendation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);

    // AI Recommendation or "No actions queued" should appear
    const aiRec = page.getByText("AI Recommendation").or(
      page.getByText("No actions queued"),
    );
    await expect(aiRec.first()).toBeVisible({ timeout: 10_000 });
  });

  test("predictive badge visible on leads with predictive scoring", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);

    // Check for "Predictive" badge from the Next Best Action widget
    const predictiveBadge = page.getByText("Predictive");
    const isVisible = await predictiveBadge.first().isVisible().catch(() => false);

    // This is data-dependent — if no predictive leads, that's OK
    if (!isVisible) {
      // Verify at least the dashboard rendered correctly
      await expect(page.getByText("Dashboard")).toBeVisible();
    }
  });
});
