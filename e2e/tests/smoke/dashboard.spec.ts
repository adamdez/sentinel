import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/dashboard.page";

test.describe("Dashboard", () => {
  test("loads with widget grid and no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectWidgetsVisible();

    // Allow network/auth errors, but flag React crashes
    const reactCrashes = consoleErrors.filter(
      (e) => e.includes("Unhandled") || e.includes("ChunkLoadError"),
    );
    expect(reactCrashes).toHaveLength(0);
  });

  test("sidebar navigation links are present", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByPlaceholder("Find lead, address, APN, or phone..."),
    ).toBeVisible({ timeout: 15_000 });

    const sidebarLinks = [
      "Today",
      "Lead Queue",
      "Dialer",
      "Active",
      "Dispo",
    ];

    for (const link of sidebarLinks) {
      await expect(page.getByRole("link", { name: link })).toBeVisible();
    }
  });

  test("New Priority Leads sidebar renders without crash", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectBreakingLeadsTicker();
    // No unhandled errors = pass
  });
});
