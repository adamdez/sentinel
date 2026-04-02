import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, "..", ".auth", "adam.json");

setup("authenticate as Adam", async ({ page }) => {
  const email = process.env.E2E_ADAM_EMAIL ?? "adam@dominionhomedeals.com";
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const isLocalTarget = /localhost|127\.0\.0\.1/.test(baseUrl);
  const password = process.env.E2E_ADAM_PASSWORD ?? (isLocalTarget ? "Dominion2026!" : undefined);

  if (!password) {
    throw new Error(
      "E2E_ADAM_PASSWORD env var is required for non-local E2E targets.",
    );
  }

  await page.goto("/login");
  await expect(page.getByText("SENTINEL")).toBeVisible();

  // Select Adam's profile
  const adamProfile = page.getByRole("button", { name: /adam/i }).first();
  await expect(adamProfile).toBeVisible({ timeout: 10_000 });
  await adamProfile.click();
  await expect(page.getByText("Sign in as Adam")).toBeVisible({ timeout: 10_000 });

  // Enter password and submit
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(page.getByPlaceholder("Find lead, address, APN, or phone...")).toBeVisible({ timeout: 15_000 });

  // Save auth state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});
