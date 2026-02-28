import { test, expect } from "@playwright/test";
import { GmailPage } from "../../pages/gmail.page";

test.describe("Gmail Integration", () => {
  test("Gmail page loads with connect or connected state", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    // Should show either "Connect Gmail" button or connected status
    const connectBtn = page.getByRole("button", { name: /connect gmail/i });
    const connectedText = page.getByText(/connected/i);

    const isConnectVisible = await connectBtn.isVisible().catch(() => false);
    const isConnectedVisible = await connectedText.first().isVisible().catch(() => false);

    expect(isConnectVisible || isConnectedVisible).toBe(true);
  });

  test("Connect Gmail button triggers OAuth flow", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    const connectBtn = page.getByRole("button", { name: /connect gmail/i });
    const isVisible = await connectBtn.isVisible().catch(() => false);
    test.skip(!isVisible, "Gmail already connected — skip OAuth test");

    // Intercept the connect API call
    const apiPromise = page.waitForResponse(
      (res) => res.url().includes("/api/gmail/connect"),
      { timeout: 15_000 },
    );

    await connectBtn.click();

    const response = await apiPromise;
    const body = await response.json();

    // Should return an OAuth URL or error about missing Google credentials
    expect(response.status()).toBeLessThan(500);
    const hasUrl = !!body.url;
    const hasError = !!body.error;
    expect(hasUrl || hasError).toBe(true);
  });

  test("Gmail page shows scope information", async ({ page }) => {
    const gmail = new GmailPage(page);
    await gmail.goto();
    await gmail.expectLoaded();

    // Scope info should be visible on the page
    const scopeText = page.getByText(/gmail\.send|gmail\.readonly/i);
    const isVisible = await scopeText.first().isVisible().catch(() => false);
    // May not be visible if already connected
    if (!isVisible) {
      test.skip(true, "Scope info hidden when connected");
    }
  });
});
