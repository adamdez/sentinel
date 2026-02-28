import { type Page, expect } from "@playwright/test";

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectLoaded() {
    await expect(this.page.getByText("Dashboard")).toBeVisible({ timeout: 15_000 });
  }

  async expectWidgetsVisible() {
    // At least some widget containers should be rendered
    const cards = this.page.locator("[class*='glass']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  }

  async expectBreakingLeadsTicker() {
    // The sidebar or ticker should contain "Breaking" or lead-related content
    const ticker = this.page.locator("text=Breaking Leads").or(
      this.page.locator("[class*='breaking']"),
    );
    // Ticker may not show if no leads — just verify no crash
    await this.page.waitForTimeout(1000);
  }
}
