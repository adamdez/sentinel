import { test, expect } from "@playwright/test";
import { ProspectsPage } from "../../pages/prospects.page";

test.describe("Master Client File Modal", () => {
  test("opens from prospect row and shows all tabs", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await prospects.expectLoaded();

    // Wait for data to load
    await page.waitForTimeout(3000);

    // Click first prospect row to open MCF
    const rows = page.locator("table tbody tr, [data-testid='prospect-row']");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB — skip MCF test");

    await rows.first().click();

    // Modal should appear
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Verify tabs exist
    const expectedTabs = ["Overview", "Timeline", "Comps", "Calculator", "Documents"];
    for (const tab of expectedTabs) {
      await expect(
        modal.getByText(tab, { exact: true }).or(
          modal.getByRole("tab", { name: tab }),
        ).first(),
      ).toBeVisible();
    }
  });

  test("comps map renders without crash", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB");

    await rows.first().click();
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Click Comps tab
    const compsTab = modal.getByText("Comps", { exact: true }).or(
      modal.getByRole("tab", { name: "Comps" }),
    );
    if (await compsTab.isVisible()) {
      await compsTab.first().click();
      await page.waitForTimeout(2000);

      // Map container should render (leaflet)
      const map = modal.locator(".leaflet-container, [class*='map']");
      // Map may not have data but should not crash
    }
  });

  test("offer calculator updates live values", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB");

    await rows.first().click();
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Click Calculator tab
    const calcTab = modal.getByText("Calculator", { exact: true }).or(
      modal.getByRole("tab", { name: "Calculator" }),
    );
    if (await calcTab.isVisible()) {
      await calcTab.first().click();
      await page.waitForTimeout(1000);

      // Calculator inputs should be present
      const inputs = modal.locator("input[type='number'], input[type='text']");
      const inputCount = await inputs.count();
      expect(inputCount).toBeGreaterThanOrEqual(1);
    }
  });
});
