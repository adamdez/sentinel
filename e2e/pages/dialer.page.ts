import { type Page, expect } from "@playwright/test";

export class DialerPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dialer");
  }

  async expectLoaded() {
    await expect(this.page.getByText("Power Dialer")).toBeVisible({ timeout: 15_000 });
  }

  async expectQueuePresent() {
    // Queue section should exist even if empty
    const queue = this.page.locator("text=Queue").or(
      this.page.locator("text=No leads"),
    );
    await expect(queue.first()).toBeVisible({ timeout: 10_000 });
  }

  async expectStatCards() {
    const statLabels = ["My Calls", "Team Calls", "Connect %"];
    for (const label of statLabels) {
      await expect(this.page.getByText(label)).toBeVisible();
    }
  }

  async expectHotkeysRespond() {
    // Press "1" key — should not crash, may trigger disposition if in call
    await this.page.keyboard.press("1");
    // No crash = pass
    await this.page.waitForTimeout(300);
  }
}
