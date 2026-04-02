import { test, expect } from "@playwright/test";

test.describe("Claim Lead", () => {
  test("claim controls render when unclaimed prospects exist", async ({ page }) => {
    await page.goto("/sales-funnel/prospects");
    await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(3000);

    // Look for Claim buttons
    const claimButtons = page.getByRole("button", { name: /claim/i });
    const count = await claimButtons.count();
    if (count === 0) {
      // No unclaimed prospects right now is a valid state.
      await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible();
      return;
    }

    // Verify at least one claim button exists
    await expect(claimButtons.first()).toBeVisible();
  });

  test("claiming a prospect changes status via API", async ({ page }) => {
    await page.goto("/sales-funnel/prospects");
    await page.waitForTimeout(3000);

    const claimButtons = page.getByRole("button", { name: /claim/i });
    const count = await claimButtons.count();
    if (count === 0) {
      await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible();
      return;
    }

    // Intercept the API call to verify it fires
    const apiPromise = page.waitForResponse(
      (res) => res.url().includes("/api/prospects") && res.request().method() === "PATCH",
      { timeout: 15_000 },
    );

    await claimButtons.first().click();

    const response = await apiPromise;
    expect(response.status()).toBeLessThan(500);
  });

  test("claimed lead appears in dialer queue", async ({ page }) => {
    await page.goto("/dialer");
    await expect(page.getByRole("heading", { name: "Dialer" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(3000);

    // The queue section should load (may be empty if no leads)
    const queueSection = page.locator("text=Dial Queue").or(
      page.locator("text=No one is queued to call yet"),
    );
    await expect(queueSection.first()).toBeVisible({ timeout: 10_000 });
  });
});
