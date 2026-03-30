import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const TINA_TEST_EMAIL = process.env.TINA_TEST_EMAIL ?? "tina.tester@example.com";
const TEST_PASSWORD = process.env.TINA_TEST_PASSWORD ?? "Tina-Test-Only-2026!";
const FIXTURE_SET = process.env.TINA_FIXTURE_SET ?? "clean-sole-prop";
const FIXTURE_DIR = path.join(ROOT, "e2e", "fixtures", "tina", FIXTURE_SET);
const OUTPUT_DIR = path.join(ROOT, "output", "playwright", "tina-owner-flow", FIXTURE_SET);
const MANIFEST_PATH = path.join(FIXTURE_DIR, "manifest.json");
const TINA_STORAGE_KEY = "tina.workspace.v1";

function loadDotEnvLikeFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const text = fs.readFileSync(filePath, "utf8");
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const envFromFile = loadDotEnvLikeFile(path.join(ROOT, ".env.local"));
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFromFile.NEXT_PUBLIC_SUPABASE_URL ?? null;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? envFromFile.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;

if (!fs.existsSync(MANIFEST_PATH)) {
  throw new Error(`Tina fixture manifest not found at ${MANIFEST_PATH}`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const FIXTURES = {
  priorReturn: path.join(FIXTURE_DIR, manifest.prior_return),
  booksFiles: (manifest.books_files ?? []).map((name) => path.join(FIXTURE_DIR, name)),
  bankFiles: (manifest.bank_files ?? []).map((name) => path.join(FIXTURE_DIR, name)),
};

const notes = [];
const UPLOAD_CONFIRMATION_TEXT = {
  "Add QuickBooks or P&L": "Tina saved quickbooks or your profit-and-loss report.",
  "Add bank statements": "Tina saved business bank and card statements.",
  "Add contractor papers": "Tina saved contractor payments and 1099 list.",
  "Add payroll papers": "Tina saved payroll reports and w-2 papers.",
  "Add sales tax papers": "Tina saved washington sales tax history.",
  "Add inventory papers": "Tina saved inventory count or end-of-year inventory value.",
  "Add big purchase papers": "Tina saved big purchase list and depreciation papers.",
  "Add election papers": "Tina saved llc tax election papers.",
};

function logNote(line) {
  console.log(line);
  notes.push(`- ${line}`);
}

async function screenshot(page, name) {
  const targetPath = path.join(OUTPUT_DIR, name);

  try {
    await page.screenshot({
      path: targetPath,
      fullPage: true,
    });
    return;
  } catch {
    await page.waitForTimeout(1000);
  }

  await page.screenshot({
    path: targetPath,
    fullPage: false,
  });
}

async function signInTinaTesterSession() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const storage = {
    values: {},
    getItem(key) {
      return this.values[key] ?? null;
    },
    setItem(key, value) {
      this.values[key] = value;
    },
    removeItem(key) {
      delete this.values[key];
    },
  };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TINA_TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (error || !data.session) {
    throw error ?? new Error("Tina test sign-in returned no session.");
  }

  return {
    session: data.session,
    storageKey: supabase.auth.storageKey,
  };
}

async function waitForQuiet(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

async function extractFocusText(page) {
  const text = await page.locator("main").innerText();
  const match = text.match(
    /Today with Tina\s+([^\n]+)\s+([^\n]+)\s+Tina is only showing the next/i,
  );

  if (!match) {
    return null;
  }

  return {
    title: match[1].trim(),
    summary: match[2].trim(),
  };
}

async function extractNextAskText(page) {
  const text = await page.locator("main").innerText();
  const match = text.match(
    /Tina's next few asks\s+([\s\S]*?)Deeper review tools/i,
  );

  return match ? match[1].trim() : null;
}

async function extractRecommendationTitle(page) {
  const text = await page.locator("main").innerText();
  const match = text.match(/Recommendation\s+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function assertOwnerAskCount(visibleNextActions, stageLabel) {
  if (visibleNextActions.length > 3) {
    throw new Error(
      `Tina showed ${visibleNextActions.length} owner asks ${stageLabel}. The calm-owner limit is 3.`
    );
  }
}

function assertForbiddenNextActions(visibleNextActions, nextAskText, stageLabel) {
  const forbiddenActions = manifest.expected_absent_next_actions ?? [];
  const normalizedNextAskText = (nextAskText ?? "").toLowerCase();

  for (const action of forbiddenActions) {
    if (visibleNextActions.includes(action)) {
      throw new Error(`Tina still showed "${action}" ${stageLabel}, but this fixture expects that ask to stay hidden.`);
    }

    if (normalizedNextAskText.includes(action.toLowerCase())) {
      throw new Error(
        `Tina still mentioned "${action}" in the owner ask list ${stageLabel}, but this fixture expects that ask to stay hidden.`
      );
    }
  }
}

function assertExpectedVisibleNextActions(visibleNextActions, expectedActions, stageLabel) {
  if (!expectedActions || expectedActions.length === 0) return;

  const normalizedActual = [...visibleNextActions].sort();
  const normalizedExpected = [...expectedActions].sort();

  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(
      `Tina showed ${JSON.stringify(visibleNextActions)} ${stageLabel}, but this fixture expected ${JSON.stringify(expectedActions)}.`
    );
  }
}

function assertPageTextIncludes(pageText, requiredSnippets, stageLabel) {
  if (!requiredSnippets || requiredSnippets.length === 0) return;

  for (const snippet of requiredSnippets) {
    if (!pageText.includes(snippet)) {
      throw new Error(
        `Tina did not show "${snippet}" ${stageLabel}, but this fixture expected it in the page text.`
      );
    }
  }
}

async function uploadSupportingFile(page, triggerName, filePath) {
  await page.getByRole("button", { name: triggerName, exact: true }).first().click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(filePath);
  const confirmationText = UPLOAD_CONFIRMATION_TEXT[triggerName];
  if (confirmationText) {
    await page.getByText(confirmationText, { exact: true }).waitFor({ timeout: 60000 });
  }
  await waitForQuiet(page);
}

async function uploadSupportingFiles(page, triggerName, filePaths) {
  for (const filePath of filePaths) {
    logNote(`Uploading ${path.basename(filePath)} through "${triggerName}".`);
    await uploadSupportingFile(page, triggerName, filePath);
  }
}

async function readAllUnreadDocuments(page) {
  const unreadLocator = page.getByRole("button", { name: "Let Tina read this" });
  const enabledUnreadLocator = page
    .locator("button:not([disabled])")
    .filter({ hasText: "Let Tina read this" });
  let unreadCount = await unreadLocator.count();

  while (unreadCount > 0) {
    let readyCount = await enabledUnreadLocator.count();
    let tries = 0;

    while (readyCount === 0 && tries < 60) {
      await page.waitForTimeout(1000);
      unreadCount = await unreadLocator.count();
      if (unreadCount === 0) {
        return;
      }
      readyCount = await enabledUnreadLocator.count();
      tries += 1;
    }

    if (readyCount === 0) {
      const unreadButtonStates = await unreadLocator.evaluateAll((buttons) =>
        buttons.map((button) => ({
          text: (button.textContent ?? "").replace(/\s+/g, " ").trim(),
          disabled: (button instanceof HTMLButtonElement && button.disabled) || button.getAttribute("aria-disabled") === "true",
        }))
      );
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "03-read-stalled.png"),
        fullPage: true,
      });
      throw new Error(
        `Tina's unread-document button stayed disabled for too long. States: ${JSON.stringify(unreadButtonStates)}`
      );
    }

    await enabledUnreadLocator.first().click();
    await waitForQuiet(page);
    unreadCount = await unreadLocator.count();
  }
}

async function clearWorkspace(page) {
  const resetButton = page.getByRole("button", { name: "Start this draft over" });
  if (await resetButton.count()) {
    await resetButton.first().click();
    await waitForQuiet(page);
  }

  while ((await page.getByRole("button", { name: "Remove" }).count()) > 0) {
    await page.getByRole("button", { name: "Remove" }).first().click();
    await waitForQuiet(page);
  }
}

async function extractVisibleNextActions(page) {
  return page.locator("main button").evaluateAll((buttons) =>
    Array.from(
      new Set(
        buttons
          .map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim())
          .filter((text) => /^(Add |Answer this above$|Review this with Tina$)/.test(text))
      )
    )
  );
}

async function seedProgrammaticSession(page, authSession) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ storageKey, session }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, authSession);
  await page.evaluate(async ({ accessToken }) => {
    try {
      await fetch("/api/auth/ensure-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Tina can still proceed; the auth sync provider will try again after load.
    }
  }, { accessToken: authSession.session.access_token });
}

async function pickTinaTesterProfile(page) {
  await page.getByRole("button", { name: /TT Tina Tester QA/i }).waitFor({ timeout: 60000 });

  try {
    await page.getByRole("button", { name: /TT Tina Tester QA/i }).click({ timeout: 5000 });
    await page.getByPlaceholder("Enter password").waitFor({ timeout: 5000 });
    return;
  } catch {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const match = buttons.find((button) => button.textContent?.includes("Tina Tester"));
      if (!match) {
        throw new Error("Tina tester login button not found.");
      }
      match.click();
    });
    await page.getByPlaceholder("Enter password").waitFor({ timeout: 60000 });
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();

  try {
    const authSession = await signInTinaTesterSession().catch((error) => {
      logNote(
        `Programmatic Tina sign-in was unavailable, so the harness is falling back to the visual login flow. ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    });

    if (authSession) {
      logNote("Opening Tina through the saved Supabase test session.");
      await seedProgrammaticSession(page, authSession);
      logNote("Seeded Tina's browser session directly for the tester account.");
      await page.goto(`${BASE_URL}/tina`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/tina$/);
    } else {
      logNote("Opening login page.");
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await pickTinaTesterProfile(page);
      await page.getByPlaceholder("Enter password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForTimeout(4000);
      await page.goto(`${BASE_URL}/tina`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/tina$/);
      logNote("Signed in through the normal Sentinel login page and opened Tina.");
    }

    await page.getByText("Today with Tina", { exact: true }).waitFor({ timeout: 60000 });
    await waitForQuiet(page);
    await clearWorkspace(page);
    await waitForQuiet(page);
    await screenshot(page, "01-initial.png");

    const initialFocus = await extractFocusText(page);
    if (initialFocus) {
      logNote(`Initial Tina focus: ${initialFocus.title} ${initialFocus.summary}`);
    }

    logNote("Uploading prior-year return through Tina's first-step input.");
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURES.priorReturn);
    await page.getByText("Last year's return is now saved in Tina.").waitFor({ timeout: 60000 });
    await waitForQuiet(page);

    logNote("Filling the easy business questions like a real owner would.");
    await page.getByRole("textbox", { name: /Business name/i }).fill(manifest.business_name);
    await waitForQuiet(page);
    await page.getByRole("combobox", { name: /Entity type/i }).selectOption(manifest.entity_type);
    await waitForQuiet(page);

    if (manifest.llc_federal_tax_treatment) {
      await page.getByRole("combobox", { name: /LLC tax path/i }).waitFor({ timeout: 60000 });
      await page
        .getByRole("combobox", { name: /LLC tax path/i })
        .selectOption(manifest.llc_federal_tax_treatment);
      await waitForQuiet(page);
    }

    if (manifest.llc_community_property_status) {
      await page
        .getByRole("combobox", { name: /Spouse community-property case/i })
        .selectOption(manifest.llc_community_property_status);
      await waitForQuiet(page);
    }

    await page.getByRole("textbox", { name: /Formation state/i }).fill(manifest.formation_state);
    await waitForQuiet(page);
    await page.getByRole("textbox", { name: /Formation date/i }).fill(manifest.formation_date);
    await waitForQuiet(page);
    await page
      .getByRole("textbox", { name: /NAICS code or activity hint/i })
      .fill(manifest.naics_code);
    await waitForQuiet(page);
    await page.getByRole("textbox", { name: /Business name/i }).fill(manifest.business_name);
    await waitForQuiet(page);
    await screenshot(page, "02-after-basic-answers.png");

    const postProfileFocus = await extractFocusText(page);
    if (postProfileFocus) {
      logNote(`Focus after the easy questions: ${postProfileFocus.title}`);
    }

    logNote("Uploading the main books file from the QuickBooks/P&L lane.");
    await uploadSupportingFiles(page, "Add QuickBooks or P&L", FIXTURES.booksFiles);
    await page.getByText("Tina saved quickbooks or your profit-and-loss report.").waitFor({
      timeout: 30000,
    });

    logNote("Uploading the bank-support file from Tina's short next-asks list.");
    await uploadSupportingFiles(page, "Add bank statements", FIXTURES.bankFiles);
    await waitForQuiet(page);

    logNote("Letting Tina read the prior return and the two money files.");
    await readAllUnreadDocuments(page);

    const recommendationTitleAfterReading = await extractRecommendationTitle(page);
    if (recommendationTitleAfterReading) {
      logNote(`Recommendation after reading the saved papers: ${recommendationTitleAfterReading}`);
    }

    if (manifest.expected_recommendation_title_after_reading) {
      if (recommendationTitleAfterReading !== manifest.expected_recommendation_title_after_reading) {
        throw new Error(
          `Expected recommendation "${manifest.expected_recommendation_title_after_reading}" after reading papers, but saw "${recommendationTitleAfterReading ?? "nothing"}".`
        );
      }
      logNote(
        `Recommendation matched expected LLC paper-first result: ${manifest.expected_recommendation_title_after_reading}.`
      );
    }

    const nextAskTextAfterReading = await extractNextAskText(page);
    const visibleNextActionsAfterReading = await extractVisibleNextActions(page);
    logNote(
      `Visible next-action buttons after reading the core papers: ${visibleNextActionsAfterReading.length}.`
    );
    if (visibleNextActionsAfterReading.length > 0) {
      logNote(`Post-read next-action labels: ${visibleNextActionsAfterReading.join(" | ")}.`);
    }
    assertOwnerAskCount(visibleNextActionsAfterReading, "after reading the core papers");
    assertForbiddenNextActions(
      visibleNextActionsAfterReading,
      nextAskTextAfterReading,
      "after reading the core papers"
    );
    assertExpectedVisibleNextActions(
      visibleNextActionsAfterReading,
      manifest.expected_visible_next_actions_after_reading,
      "after reading the core papers"
    );

    await screenshot(page, "03-after-reading-papers.png");

    logNote("Asking Tina to sort the books lane.");
    await page.getByRole("button", { name: "Let Tina sort these books" }).click();
    await waitForQuiet(page);

    const nextAskBlock = await extractNextAskText(page);
    if (nextAskBlock) {
      logNote(`Next-ask block after the core uploads: ${nextAskBlock.replace(/\s+/g, " ").slice(0, 260)}...`);
    }

    logNote("Opening Tina's deeper tools and running the first review passes.");
    await page.getByRole("button", { name: "Show deeper Tina tools" }).click();
    const reviewButtons = page.getByRole("button", {
      name: /Check (my setup|for conflicts|again)/,
    });
    await reviewButtons.nth(0).click();
    await waitForQuiet(page);
    await reviewButtons.nth(1).click();
    await waitForQuiet(page);
    await screenshot(page, "04-after-review-passes.png");

    const finalFocus = await extractFocusText(page);
    if (finalFocus) {
      logNote(`Final Tina focus after uploads and review passes: ${finalFocus.title}`);
    }

    const visibleNextActions = await extractVisibleNextActions(page);
    const pageTextAfterReview = await page.locator("main").innerText();
    logNote(`Visible next-action buttons on the page: ${visibleNextActions.length}.`);
    if (visibleNextActions.length > 0) {
      logNote(`Visible next-action labels: ${visibleNextActions.join(" | ")}.`);
    }
    assertOwnerAskCount(visibleNextActions, "after the review passes");
    assertForbiddenNextActions(visibleNextActions, nextAskBlock, "after the review passes");
    assertExpectedVisibleNextActions(
      visibleNextActions,
      manifest.expected_visible_next_actions_after_review,
      "after the review passes"
    );
    assertPageTextIncludes(
      pageTextAfterReview,
      manifest.expected_page_text_after_review,
      "after the review passes"
    );

    const summary = [
      "# Tina Owner Flow Check",
      "",
      `Base URL: ${BASE_URL}`,
      `Fixture set: ${FIXTURE_SET}`,
      `Fixture pack: ${FIXTURE_DIR}`,
      `Business: ${manifest.business_name}`,
      `Fixture notes: ${manifest.notes}`,
      "",
      "## Notes",
      ...notes,
      "",
      "## Artifacts",
      "- 01-initial.png",
      "- 02-after-basic-answers.png",
      "- 03-after-reading-papers.png",
      "- 04-after-review-passes.png",
      "",
    ].join("\n");

    fs.writeFileSync(path.join(OUTPUT_DIR, "summary.md"), summary, "utf8");
    console.log(`Summary written to ${path.join(OUTPUT_DIR, "summary.md")}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[tina-owner-flow-check] Failed:", error);
  process.exitCode = 1;
});
