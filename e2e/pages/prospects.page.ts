import { type Page, expect } from "@playwright/test";

export class ProspectsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/sales-funnel/prospects");
  }

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { name: "Prospects" })).toBeVisible({
      timeout: 15_000,
    });
  }

  async waitForProspectsTable() {
    const row = this.page.locator("table tbody tr, [data-testid='prospect-row']").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
  }

  async clickFirstProspectRow() {
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
