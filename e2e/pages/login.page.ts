import { type Page, expect } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
    await expect(this.page.getByText("SENTINEL")).toBeVisible();
  }

  async selectUser(name: string) {
    await this.page.getByText(name, { exact: true }).click();
    await expect(this.page.getByText(`Sign in as ${name}`)).toBeVisible();
  }

  async enterPassword(password: string) {
    await this.page.getByPlaceholder("Enter password").fill(password);
  }

  async submit() {
    await this.page.getByRole("button", { name: "Sign In" }).click();
  }

  async expectRedirectToDashboard() {
    await this.page.waitForURL("**/dashboard", { timeout: 30_000 });
  }
}
