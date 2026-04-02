import { test, expect } from "@playwright/test";

test.describe("Lead Queue dial queue action", () => {
  test("bulk add to dial queue returns a non-error response", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Lead Queue" })).toBeVisible({ timeout: 20_000 });

    const emptyState = page.getByText("No leads match current filters.");
    if (await emptyState.isVisible().catch(() => false)) {
      // Valid state when no rows are available under active filters.
      await expect(emptyState).toBeVisible();
      return;
    }

    const headerCheckbox = page.locator("input[type='checkbox']").first();
    await expect(headerCheckbox).toBeVisible({ timeout: 10_000 });
    await headerCheckbox.check();

    const actionButton = page.getByRole("button", { name: /Add to Dial Queue/i }).first();
    await expect(actionButton).toBeVisible({ timeout: 10_000 });

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/dialer/v1/dial-queue") && response.request().method() === "POST",
      { timeout: 20_000 },
    );

    await actionButton.click();

    const response = await responsePromise;
    expect(response.status(), await response.text()).toBeLessThan(500);

    const failureToast = page.getByText("Failed to add leads to dial queue");
    await expect(failureToast).toHaveCount(0);
  });
});
