import { type Page, expect } from "@playwright/test";

export class DialerPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dialer");
  }

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { name: "Dialer" })).toBeVisible({
      timeout: 15_000,
    });
  }

  async expectQueuePresent() {
    await expect(this.page.getByRole("heading", { name: "Dial Queue" })).toBeVisible({
      timeout: 10_000,
    });
  }

  async expectStatCards() {
    const statLabels = ["Outbound", "Pickups", "Inbound", "Missed Calls", "Talk Time"];
    for (const label of statLabels) {
      await expect(this.page.getByText(label).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  }

  async expectHotkeysRespond() {
    await this.page.keyboard.press("1");
    await this.page.waitForTimeout(300);
  }
}
