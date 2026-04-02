import { test, expect } from "@playwright/test";
import { ProspectsPage } from "../../pages/prospects.page";

test.describe("Master Client File Panel", () => {
  test("opens from prospect row and shows primary tabs", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await prospects.expectLoaded();

    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB — skip Client File test");

    await rows.first().click();

    const expectedTabs = ["Overview", "Contact", "Property Intel", "Dossier", "Legal"];
    for (const tab of expectedTabs) {
      await expect(page.getByRole("button", { name: tab }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("property intel tab renders without crash", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB");

    await rows.first().click();
    const intelTab = page.getByRole("button", { name: "Property Intel" }).first();
    await expect(intelTab).toBeVisible({ timeout: 10_000 });
    await intelTab.click();

    const intelSection = page.getByText("Property Basics").or(
      page.getByText("Property Intel"),
    );
    await expect(intelSection.first()).toBeVisible({ timeout: 10_000 });
  });

  test("dossier tab renders without crash", async ({ page }) => {
    const prospects = new ProspectsPage(page);
    await prospects.goto();
    await page.waitForTimeout(3000);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "No prospects in DB");

    await rows.first().click();
    const dossierTab = page.getByRole("button", { name: "Dossier" }).first();
    await expect(dossierTab).toBeVisible({ timeout: 10_000 });
    await dossierTab.click();

    const dossierSection = page.getByText("Dossier").or(
      page.getByText("facts", { exact: false }),
    );
    await expect(dossierSection.first()).toBeVisible({ timeout: 10_000 });
  });
});
