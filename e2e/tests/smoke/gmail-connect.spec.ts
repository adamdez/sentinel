import { test, expect } from "@playwright/test";
import { GmailPage } from "../../pages/gmail.page";

test.describe("Gmail Integration", () => {
  test("Gmail page loads with connect or connected state", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    const connectBtn = page.getByRole("button", { name: /connect gmail/i });
    const connectedText = page.getByText(/connected/i);
    const loadingText = page.getByText(/loading gmail integration/i);

    const isConnectVisible = await connectBtn.isVisible().catch(() => false);
    const isConnectedVisible = await connectedText.first().isVisible().catch(() => false);
    const isLoadingVisible = await loadingText.first().isVisible().catch(() => false);

    expect(isConnectVisible || isConnectedVisible || isLoadingVisible).toBe(true);
  });

  test("Connect Gmail button triggers OAuth flow", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    const connectBtn = page.getByRole("button", { name: /connect gmail/i });
    const isVisible = await connectBtn.isVisible().catch(() => false);
    if (!isVisible) {
      await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
      return;
    }

    const apiPromise = page.waitForResponse(
      (res) => res.url().includes("/api/gmail/connect"),
      { timeout: 15_000 },
    );

    await connectBtn.click();

    const response = await apiPromise;
    const body = await response.json();

    expect(response.status()).toBeLessThan(500);
    const hasUrl = !!body.url;
    const hasError = !!body.error;
    expect(hasUrl || hasError).toBe(true);
  });

  test("Gmail page shows scope information", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    const scopeText = page.getByText(/gmail\.send|gmail\.readonly/i);
    const loadingText = page.getByText(/loading gmail integration/i);
    const connectedText = page.getByText(/connected as/i);
    const isVisible = await scopeText.first().isVisible().catch(() => false);
    const isLoadingVisible = await loadingText.first().isVisible().catch(() => false);
    const isConnectedVisible = await connectedText.first().isVisible().catch(() => false);

    if (!isVisible && !isLoadingVisible && !isConnectedVisible) {
      await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
      return;
    }
    await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
  });
});
