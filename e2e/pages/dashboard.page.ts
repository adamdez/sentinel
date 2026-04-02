import { type Page, expect } from "@playwright/test";

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectLoaded() {
    await expect(
      this.page.getByPlaceholder("Find lead, address, APN, or phone..."),
    ).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByRole("link", { name: "Today" })).toBeVisible({
      timeout: 10_000,
    });
  }

  async expectWidgetsVisible() {
    await expect(this.page.getByText("Overdue").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.page.getByText("Tasks").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async expectBreakingLeadsTicker() {
    const reviewSurface = this.page.locator("text=Review Blockers").or(
      this.page.locator("text=Unlinked Calls"),
    );
    await expect(reviewSurface.first()).toBeVisible({ timeout: 15_000 });
  }
}
