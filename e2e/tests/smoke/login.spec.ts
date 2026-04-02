import { test, expect } from "@playwright/test";
import { LoginPage } from "../../pages/login.page";

test.describe("Login", () => {
  test("login page renders with team selector", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.getByText("SENTINEL")).toBeVisible();
    await expect(page.getByText("Select your profile")).toBeVisible();
    await expect(page.getByText("Adam")).toBeVisible();
    await expect(page.getByText("user 1")).toBeVisible();
    await expect(page.getByText("Logan")).toBeVisible();
  });

  test("authenticated session reaches dashboard", async ({ page }) => {
    // Auth state is pre-loaded from the setup project
    await page.goto("/dashboard");
    await expect(
      page.getByPlaceholder("Find lead, address, APN, or phone..."),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /adam/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
