import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, "..", ".auth", "adam.json");

setup("authenticate as Adam", async ({ page }) => {
  const email = process.env.E2E_ADAM_EMAIL ?? "adam@dominionhomedeals.com";
  const password = process.env.E2E_ADAM_PASSWORD;

  if (!password) {
    throw new Error(
      "E2E_ADAM_PASSWORD env var is required. Set it in .env.local or pass via CLI.",
    );
  }

  await page.goto("/login");
  await expect(page.getByText("SENTINEL")).toBeVisible();

  // Select Adam's profile
  await page.getByText("Adam").click();
  await expect(page.getByText("Sign in as Adam")).toBeVisible();

  // Enter password and submit
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 15_000 });

  // Save auth state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});
