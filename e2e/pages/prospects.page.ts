import { type Page, expect } from "@playwright/test";

export class ProspectsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/sales-funnel/prospects");
  }

  async expectLoaded() {
    await expect(this.page.getByText("Prospects")).toBeVisible({ timeout: 15_000 });
  }

  async waitForProspectsTable() {
    // Wait for at least one prospect row or the "no prospects" message
    const row = this.page.locator("table tbody tr, [class*='glass']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
  }

  async clickFirstProspectRow() {
    // Click the first data row to open Master Client File modal
    const rows = this.page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
    }
  }

  async clickClaimOnFirst() {
    const claimBtn = this.page.getByRole("button", { name: /claim/i }).first();
    await claimBtn.click();
  }
}
