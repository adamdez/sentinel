import { type Page, expect } from "@playwright/test";

export class GmailPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/gmail");
  }

  async expectLoaded() {
    await expect(this.page.getByText("Gmail").first()).toBeVisible({ timeout: 15_000 });
  }

  async expectConnectButton() {
    await expect(
      this.page.getByRole("button", { name: /connect gmail/i }),
    ).toBeVisible();
  }

  async expectConnectedState() {
    const connected = this.page.getByText(/connected/i).first();
    await expect(connected).toBeVisible({ timeout: 10_000 });
  }
}
