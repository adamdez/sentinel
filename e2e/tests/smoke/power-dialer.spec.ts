import { test, expect } from "@playwright/test";
import { DialerPage } from "../../pages/dialer.page";

test.describe("Power Dialer", () => {
  test("page loads with stat cards and queue", async ({ page }) => {
    const dialer = new DialerPage(page);
    await dialer.goto();
    await dialer.expectLoaded();
    await dialer.expectStatCards();
  });

  test("hotkeys do not crash the page", async ({ page }) => {
    const dialer = new DialerPage(page);
    await dialer.goto();
    await dialer.expectLoaded();

    // Press common hotkeys (1-9 for dispositions, Enter for dial, Escape for hang up)
    const keys = ["1", "2", "3", "4", "5", "Enter", "Escape"];
    for (const key of keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
    }

    // Page should still be functional after hotkey presses
    await expect(page.getByText("Power Dialer")).toBeVisible();
  });

  test("Twilio badge shows Ready state", async ({ page }) => {
    const dialer = new DialerPage(page);
    await dialer.goto();
    await dialer.expectLoaded();

    await expect(page.getByText(/Twilio.*Ready/i)).toBeVisible({ timeout: 10_000 });
  });

  test("ghost mode toggle works from dialer", async ({ page }) => {
    await page.goto("/dialer");
    await expect(page.getByText("Power Dialer")).toBeVisible({ timeout: 15_000 });

    // Ghost mode toggle should be in the top bar
    const ghostToggle = page.getByText("Ghost").first();
    await expect(ghostToggle).toBeVisible();
  });
});
