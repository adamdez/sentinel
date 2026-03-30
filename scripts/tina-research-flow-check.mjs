import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const TINA_TEST_EMAIL = process.env.TINA_TEST_EMAIL ?? "tina.tester@example.com";
const TEST_PASSWORD = process.env.TINA_TEST_PASSWORD ?? "Tina-Test-Only-2026!";
const FIXTURE_SET = process.env.TINA_FIXTURE_SET ?? "messy-books";
const AUTHORITY_TIMEOUT_MS = Number.parseInt(
  process.env.TINA_AUTHORITY_TIMEOUT_MS ?? `${35 * 60 * 1000}`,
  10
);
const RESUME_EXISTING = process.env.TINA_RESUME_EXISTING === "1";
const FIXTURE_DIR = path.join(ROOT, "e2e", "fixtures", "tina", FIXTURE_SET);
const OUTPUT_DIR = path.join(ROOT, "output", "playwright", "tina-research-flow", FIXTURE_SET);
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
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? envFromFile.SUPABASE_SERVICE_ROLE_KEY ?? null;
const TINA_WORKSPACE_PREFERENCES_KEY = "tina_workspace_v1";
const TINA_PACKET_VERSIONS_PREFERENCES_KEY = "tina_packet_versions_v1";
const RESEARCH_TARGETS =
  FIXTURE_SET === "fringe-opportunities"
    ? [
        {
          id: "fixed-assets-review",
          title: "Check big purchases for depreciation options",
          runChallenge: true,
          goal: "fringe savings",
        },
        {
          id: "repair-safe-harbor-review",
          title: "Check repair safe harbors before capitalizing everything",
          runChallenge: true,
          goal: "fringe savings",
        },
        {
          id: "de-minimis-writeoff-review",
          title: "Check small-equipment write-offs and safe harbors",
          runChallenge: true,
          goal: "fringe savings",
        },
        {
          id: "wa-state-review",
          title: "Check Washington business-tax treatment",
          runChallenge: true,
          goal: "authority gate",
        },
        {
          id: "multistate-review",
          title: "Check multistate filing scope",
          runChallenge: true,
          goal: "authority gate",
        },
      ]
    : [
        {
          id: "qbi-review",
          title: "Check the QBI deduction",
          runChallenge: false,
          goal: "advantage scout",
        },
        {
          id: "wa-state-review",
          title: "Check Washington business-tax treatment",
          runChallenge: true,
          goal: "authority gate",
        },
        {
          id: "multistate-review",
          title: "Check multistate filing scope",
          runChallenge: true,
          goal: "authority gate",
        },
      ];

if (!fs.existsSync(MANIFEST_PATH)) {
  throw new Error(`Tina fixture manifest not found at ${MANIFEST_PATH}`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const FIXTURES = {
  priorReturn: path.join(FIXTURE_DIR, manifest.prior_return),
  booksFiles: (manifest.books_files ?? []).map((name) => path.join(FIXTURE_DIR, name)),
  bankFiles: (manifest.bank_files ?? []).map((name) => path.join(FIXTURE_DIR, name)),
  extraFiles: (manifest.extra_files ?? []).map((name) => path.join(FIXTURE_DIR, name)),
};

const notes = [];

function logNote(line) {
  console.log(line);
  notes.push(`- ${line}`);
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function listAllUsers(admin) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    users.push(...(data?.users ?? []));

    if (!data?.users?.length || data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return users;
}

async function resetTinaTesterWorkspacePreferences() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const users = await listAllUsers(admin);
  const tester = users.find((user) => user.email?.toLowerCase() === TINA_TEST_EMAIL.toLowerCase());

  if (!tester) {
    throw new Error(`Tina tester ${TINA_TEST_EMAIL} was not found.`);
  }

  const { data, error } = await admin
    .from("user_profiles")
    .select("preferences")
    .eq("id", tester.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return false;
  }

  const nextPreferences =
    data.preferences && typeof data.preferences === "object" ? { ...data.preferences } : {};
  delete nextPreferences[TINA_WORKSPACE_PREFERENCES_KEY];
  delete nextPreferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY];

  const { error: updateError } = await admin
    .from("user_profiles")
    .update({ preferences: nextPreferences })
    .eq("id", tester.id);

  if (updateError) {
    throw updateError;
  }

  return true;
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, name),
    fullPage: true,
  });
}

async function waitForQuiet(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

async function clickFirstMatchingButton(page, triggerNames) {
  for (const triggerName of triggerNames) {
    const button = page.getByRole("button", { name: triggerName, exact: true }).first();
    if (await button.count()) {
      await button.click();
      return triggerName;
    }
  }

  throw new Error(`Could not find any upload button matching: ${triggerNames.join(", ")}`);
}

async function uploadSupportingFile(page, triggerName, filePath) {
  const triggerNames = Array.isArray(triggerName) ? triggerName : [triggerName];
  const usedTrigger = await clickFirstMatchingButton(page, triggerNames);
  const fileInputCount = await page.locator('input[type="file"]').count();
  await page.locator('input[type="file"]').nth(fileInputCount - 1).setInputFiles(filePath);
  await waitForQuiet(page);
  return usedTrigger;
}

async function uploadSupportingFiles(page, triggerName, filePaths) {
  for (const filePath of filePaths) {
    const triggerNames = Array.isArray(triggerName) ? triggerName : [triggerName];
    const usedTrigger = await uploadSupportingFile(page, triggerNames, filePath);
    logNote(`Uploading ${path.basename(filePath)} through "${usedTrigger}".`);
  }
}

async function readAllUnreadDocuments(page) {
  let unreadCount = await page.getByRole("button", { name: "Let Tina read this" }).count();

  while (unreadCount > 0) {
    await page.getByRole("button", { name: "Let Tina read this" }).first().click();
    await waitForQuiet(page);
    unreadCount = await page.getByRole("button", { name: "Let Tina read this" }).count();
  }
}

async function clearWorkspace(page, baseUrl) {
  const resetButton = page.getByRole("button", { name: "Start this draft over" });
  if (await resetButton.count()) {
    await resetButton.first().click();
    await waitForQuiet(page);
  }

  while ((await page.getByRole("button", { name: "Remove" }).count()) > 0) {
    await page.getByRole("button", { name: "Remove" }).first().click();
    await waitForQuiet(page);
  }

  const localDraft = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, TINA_STORAGE_KEY);

  if (localDraft) {
    const token = await getAccessToken(page);
    await saveWorkspace(baseUrl, token, localDraft);
  }
}

async function ensureDeeperToolsOpen(page) {
  const showButton = page.getByRole("button", { name: "Show deeper Tina tools" }).first();
  if (await showButton.count()) {
    await showButton.click();
    await waitForQuiet(page);
  }
}

async function extractVisibleNextActions(page) {
  return page.locator("main button").evaluateAll((buttons) =>
    Array.from(
      new Set(
        buttons
          .filter((button) => {
            const style = window.getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim())
      )
    )
      .filter((text) => /^(Add |Answer this above$|Review this with Tina$)/.test(text))
  );
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

async function getAccessToken(page) {
  const token = await page.evaluate(() => {
    function inspectStorage(storage) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);

          if (parsed && typeof parsed === "object") {
            if (typeof parsed.access_token === "string" && parsed.access_token.length > 0) {
              return parsed.access_token;
            }

            if (
              parsed.currentSession &&
              typeof parsed.currentSession === "object" &&
              typeof parsed.currentSession.access_token === "string" &&
              parsed.currentSession.access_token.length > 0
            ) {
              return parsed.currentSession.access_token;
            }

            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (
                  item &&
                  typeof item === "object" &&
                  typeof item.access_token === "string" &&
                  item.access_token.length > 0
                ) {
                  return item.access_token;
                }
              }
            }
          }
        } catch {
          // Ignore unrelated local-storage records.
        }
      }

      return null;
    }

    return inspectStorage(window.localStorage) ?? inspectStorage(window.sessionStorage);
  });

  if (!token) {
    throw new Error("Could not find the signed-in Supabase access token in browser storage.");
  }

  return token;
}

async function getLiveDraftFromBrowser(page) {
  const raw = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), TINA_STORAGE_KEY);
  if (!raw) {
    throw new Error("Tina workspace draft is missing from local storage.");
  }

  return JSON.parse(raw);
}

async function apiRequest(baseUrl, token, route, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.json === false ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? "POST",
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.json === false
          ? options.body
          : JSON.stringify(options.body),
  });

  const text = await res.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed: ${route}`;
    throw new Error(`${message} (status ${res.status})`);
  }

  return payload;
}

async function browserApiRequest(page, baseUrl, route, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = await getAccessToken(page);
    const result = await page.evaluate(
      async ({ requestBaseUrl, requestToken, requestRoute, requestBody }) => {
        const res = await fetch(`${requestBaseUrl}${requestRoute}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${requestToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const text = await res.text();
        let payload = null;

        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text;
        }

        return {
          ok: res.ok,
          status: res.status,
          payload,
        };
      },
      {
        requestBaseUrl: baseUrl,
        requestToken: token,
        requestRoute: route,
        requestBody: body,
      }
    );

    if (result.ok) {
      return result.payload;
    }

    const message =
      result.payload &&
      typeof result.payload === "object" &&
      "error" in result.payload &&
      typeof result.payload.error === "string"
        ? result.payload.error
        : `Request failed: ${route}`;

    if (result.status === 429 && attempt < 3) {
      const retryMatch = message.match(/try again in ([0-9.]+)s/i);
      const retryMs = retryMatch ? Math.ceil(Number.parseFloat(retryMatch[1]) * 1000) : 8000;
      const waitMs = Math.max(retryMs, 8000);
      logNote(`Tina hit a temporary research rate limit on "${route}". Waiting ${waitMs}ms before retrying.`);
      await page.waitForTimeout(waitMs);
      continue;
    }

    throw new Error(`${message} (status ${result.status})`);
  }

  throw new Error(`Request failed after retries: ${route}`);
}

async function saveWorkspace(baseUrl, token, draft) {
  const payload = await apiRequest(baseUrl, token, "/api/tina/workspace", {
    method: "PATCH",
    body: { draft },
  });

  return payload?.draft ?? draft;
}

async function loadWorkspace(baseUrl, token) {
  const payload = await apiRequest(baseUrl, token, "/api/tina/workspace", {
    method: "GET",
  });

  return payload?.draft ?? null;
}

function upsertAuthorityWorkItem(draft, workItem) {
  const nextAuthorityWork = [...draft.authorityWork];
  const existingIndex = nextAuthorityWork.findIndex((item) => item.ideaId === workItem.ideaId);

  if (existingIndex >= 0) {
    nextAuthorityWork.splice(existingIndex, 1, workItem);
  } else {
    nextAuthorityWork.push(workItem);
  }

  return {
    ...draft,
    authorityWork: nextAuthorityWork,
  };
}

function getAuthorityRunState(workItem, kind) {
  return kind === "challenge" ? workItem.challengeRun : workItem.researchRun;
}

function getAuthorityRunWaitMs(runState) {
  if (!runState) return 4000;
  if (runState.status === "rate_limited" && runState.retryAt) {
    return Math.max(Date.parse(runState.retryAt) - Date.now(), 4000);
  }
  if (runState.status === "running") return 5000;
  return 1500;
}

async function runQueuedAuthorityLane(page, baseUrl, token, options) {
  const { route, ideaId, title, kind, existingWorkItem = null } = options;
  let workItem = existingWorkItem;
  const existingRunState = workItem ? getAuthorityRunState(workItem, kind) : null;
  let lastLoggedRunStatus = null;

  if (existingRunState?.status === "succeeded" || existingRunState?.status === "failed") {
    return workItem;
  }

  if (!existingRunState || existingRunState.status === "idle") {
    const queuePayload = await browserApiRequest(page, baseUrl, route, {
      ideaId,
      action: "queue",
    });
    expect(queuePayload?.workItem, `Tina did not queue the ${kind} lane for "${title}".`);
    workItem = queuePayload.workItem;
  } else {
    logNote(`Resuming Tina's saved ${kind} lane for "${title}".`);
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < AUTHORITY_TIMEOUT_MS) {
    const runState = getAuthorityRunState(workItem, kind);
    if (runState?.status && runState.status !== lastLoggedRunStatus) {
      lastLoggedRunStatus = runState.status;
      logNote(
        `Tina marked "${title}" ${kind} as ${runState.status}${runState.retryAt ? ` until ${runState.retryAt}` : ""}.`
      );
    }

    if (runState?.status === "succeeded" || runState?.status === "failed") {
      return workItem;
    }

    if (runState?.status === "rate_limited") {
      const waitMs = getAuthorityRunWaitMs(runState);
      logNote(
        `Tina paused "${title}" because of a temporary limit. Waiting ${waitMs}ms before retrying the ${kind} lane.`
      );
      await page.waitForTimeout(waitMs);
    }

    const queuePayload = await browserApiRequest(page, baseUrl, "/api/tina/research/process-queue", {});
    token = await getAccessToken(page);
    const refreshedDraft = await loadWorkspace(baseUrl, token);
    expect(refreshedDraft, "Tina could not reload the workspace after processing the deeper queue.");
    workItem = refreshedDraft.authorityWork.find((item) => item.ideaId === ideaId) ?? workItem;

    const nextRunState = getAuthorityRunState(workItem, kind);
    if (nextRunState?.status && nextRunState.status !== lastLoggedRunStatus) {
      lastLoggedRunStatus = nextRunState.status;
      logNote(
        `Tina marked "${title}" ${kind} as ${nextRunState.status}${nextRunState.retryAt ? ` until ${nextRunState.retryAt}` : ""}.`
      );
    }

    if (nextRunState?.status === "succeeded" || nextRunState?.status === "failed") {
      return workItem;
    }

    const queueWaitMs =
      queuePayload && typeof queuePayload.nextPollDelayMs === "number"
        ? Math.max(queuePayload.nextPollDelayMs, 1500)
        : 1500;
    await page.waitForTimeout(Math.max(queueWaitMs, getAuthorityRunWaitMs(nextRunState)));
  }

  throw new Error(
    `Tina timed out while waiting for the ${kind} lane on "${title}" after ${AUTHORITY_TIMEOUT_MS}ms.`
  );
}

function createReviewedCleanupPlan(cleanupPlan) {
  return {
    ...cleanupPlan,
    suggestions: cleanupPlan.suggestions.map((suggestion) => ({
      ...suggestion,
      status: "approved",
      reviewerNotes:
        suggestion.reviewerNotes?.trim().length > 0
          ? suggestion.reviewerNotes
          : "Synthetic Tina research-flow test approved this cleanup move so the downstream pipeline could be exercised.",
    })),
  };
}

function createReviewedTaxAdjustments(taxAdjustments) {
  return {
    ...taxAdjustments,
    adjustments: taxAdjustments.adjustments.map((adjustment) =>
      adjustment.status === "ready_for_review"
        ? {
            ...adjustment,
            status: "approved",
            reviewerNotes:
              adjustment.reviewerNotes?.trim().length > 0
                ? adjustment.reviewerNotes
                : "Synthetic Tina research-flow test approved this non-authority tax move for reviewer-final coverage.",
          }
        : adjustment
    ),
  };
}

async function ensureResearchCardsVisible(page) {
  const visibleTitles = [];

  for (const target of RESEARCH_TARGETS) {
    const title = page.getByText(target.title, { exact: true }).first();
    if (await title.count()) {
      visibleTitles.push(target.title);
    }
  }

  return visibleTitles;
}

async function clickButtonIfPresent(page, names, options = {}) {
  const triggerNames = Array.isArray(names) ? names : [names];
  const timeoutMs = options.timeoutMs ?? 10000;

  for (const triggerName of triggerNames) {
    const button = page.getByRole("button", { name: triggerName, exact: true }).first();
    try {
      await button.waitFor({ timeout: timeoutMs });
      await button.click();
      return triggerName;
    } catch {
      // Try the next label.
    }
  }

  return null;
}

async function waitForApiResponse(page, routePath, timeoutMs = 420000) {
  await page.waitForResponse(
    (response) => response.url().includes(routePath) && response.request().method() === "POST",
    { timeout: timeoutMs }
  );
}

function deriveChallengeSummary(authorityWorkItem) {
  return {
    verdict: authorityWorkItem.challengeVerdict,
    memo: authorityWorkItem.challengeMemo,
    warnings: authorityWorkItem.challengeWarnings,
    questions: authorityWorkItem.challengeQuestions,
    reviewerDecision: authorityWorkItem.reviewerDecision,
    disclosureDecision: authorityWorkItem.disclosureDecision,
    status: authorityWorkItem.status,
  };
}

async function main() {
  if (!RESUME_EXISTING) {
    try {
      const resetApplied = await resetTinaTesterWorkspacePreferences();
      logNote(
        resetApplied
          ? "Cleared Tina's saved server workspace for the tester account before replaying the fixture."
          : "Tina's server workspace reset was unavailable, so the harness will rely on the in-app reset controls."
      );
    } catch (error) {
      logNote(
        `Tina's server workspace reset did not finish cleanly before replay. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
    acceptDownloads: true,
  });
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
    } else {
      logNote("Opening login page.");
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      await pickTinaTesterProfile(page);
      await page.getByPlaceholder("Enter password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();
      try {
        await page.waitForURL(/\/dashboard$|\/tina$/, { timeout: 60000 });
      } catch {
        await page.goto(`${BASE_URL}/tina`, { waitUntil: "domcontentloaded" });
      }
      logNote("Signed in through the normal Sentinel login page.");
    }

    await page.goto(`${BASE_URL}/tina`);
    await page.waitForURL(/\/tina$/, { timeout: 60000 });
    await page.getByText("Today with Tina", { exact: true }).waitFor({ timeout: 60000 });
    await waitForQuiet(page);
    let accessToken;
    let draft;

    if (RESUME_EXISTING) {
      logNote("Resuming Tina's saved workspace instead of clearing and replaying the owner flow.");
      accessToken = await getAccessToken(page);
      draft = await loadWorkspace(BASE_URL, accessToken);
      expect(draft, "Tina could not load the saved workspace draft for resume mode.");
    } else {
      await clearWorkspace(page, BASE_URL);
      await waitForQuiet(page);
      await screenshot(page, "01-initial.png");

      logNote("Uploading prior-year return through Tina's first-step input.");
      await page.locator('input[type="file"]').first().setInputFiles(FIXTURES.priorReturn);
      await page
        .getByText("Last year's return is saved in Tina", { exact: true })
        .waitFor({ timeout: 60000 });
      await waitForQuiet(page);

      logNote("Filling Tina's easy business questions.");
      await page.getByRole("textbox", { name: /Business name/i }).fill(manifest.business_name);
      await page.getByRole("combobox", { name: /Entity type/i }).selectOption(manifest.entity_type);
      await page.getByRole("textbox", { name: /Formation date/i }).fill(manifest.formation_date);
      await page.getByRole("textbox", { name: /NAICS code or activity hint/i }).fill(manifest.naics_code);
      await waitForQuiet(page);
      await screenshot(page, "02-after-basic-answers.png");
      const earlyNextActions = await extractVisibleNextActions(page);
      expect(
        earlyNextActions.length <= 3,
        `Tina showed too many early owner asks: ${earlyNextActions.join(" | ")}`
      );
      expect(
        !(await page.getByText("What Tina still has to prove", { exact: true }).count()),
        "Tina exposed deeper reviewer machinery before the owner opened it."
      );

      logNote("Uploading bookkeeping and bank support through Tina's owner flow.");
      await uploadSupportingFiles(page, ["Add QuickBooks or P&L", "Add another books file"], FIXTURES.booksFiles);
      const extraBooksFiles = FIXTURES.extraFiles.filter((filePath) => /\.(csv|xlsx?|xls)$/i.test(filePath));
      if (extraBooksFiles.length > 0) {
        await uploadSupportingFiles(page, ["Add QuickBooks or P&L", "Add another books file"], extraBooksFiles);
      }
      await page.getByText("Tina saved quickbooks or your profit-and-loss report.").waitFor({
        timeout: 30000,
      });

      await uploadSupportingFiles(page, "Add bank statements", FIXTURES.bankFiles);
      await waitForQuiet(page);

      logNote("Letting Tina read the prior return and money papers.");
      await readAllUnreadDocuments(page);
      await screenshot(page, "03-after-reading-papers.png");

      logNote("Running Tina's books sorting and first review passes.");
      await page.getByRole("button", { name: "Let Tina sort these books" }).click();
      await waitForQuiet(page);
      await ensureDeeperToolsOpen(page);
      const setupButton = await clickButtonIfPresent(page, ["Check my setup", "Check again"], {
        timeoutMs: 15000,
      });
      if (setupButton) {
        logNote(`Running deeper review step through "${setupButton}".`);
        await waitForQuiet(page);
      } else {
        logNote("Tina's setup-review button was not visible right away, so the harness kept moving.");
      }

      const conflictButton = await clickButtonIfPresent(page, ["Check for conflicts", "Check again"], {
        timeoutMs: 12000,
      });
      if (conflictButton) {
        logNote(`Running deeper conflict step through "${conflictButton}".`);
        await waitForQuiet(page);
      } else {
        logNote("Tina's conflict button was not visible right away, so the harness kept moving.");
      }
      await screenshot(page, "04-after-review-passes.png");

      accessToken = await getAccessToken(page);
      draft = await getLiveDraftFromBrowser(page);
      draft = await saveWorkspace(BASE_URL, accessToken, draft);
    }

    await ensureDeeperToolsOpen(page);
    const visibleResearchCards = await ensureResearchCardsVisible(page);
    expect(
      visibleResearchCards.length > 0,
      "Tina did not surface any research cards after the owner opened the deeper tools."
    );
    logNote(`Visible Tina research cards: ${visibleResearchCards.join(" | ")}.`);

    const researchRuns = [];

    for (const target of RESEARCH_TARGETS) {
      if (!visibleResearchCards.includes(target.title)) {
        logNote(`Skipping "${target.title}" because Tina did not surface that card for this business.`);
        continue;
      }

      logNote(`Running Tina's live ${target.goal} lane for "${target.title}".`);
      const existingWorkItem =
        draft.authorityWork.find((item) => item.ideaId === target.id) ?? null;
      const researchWorkItem = await runQueuedAuthorityLane(
        page,
        BASE_URL,
        accessToken,
        {
          route: "/api/tina/research/run",
          ideaId: target.id,
          title: target.title,
          kind: "research",
          existingWorkItem,
        }
      );
      draft = upsertAuthorityWorkItem(draft, researchWorkItem);
      accessToken = await getAccessToken(page);
      draft = await saveWorkspace(BASE_URL, accessToken, draft);

      let finalWorkItem = researchWorkItem;

      if (target.runChallenge) {
        const challengeWorkItem = await runQueuedAuthorityLane(page, BASE_URL, accessToken, {
          route: "/api/tina/research/challenge",
          ideaId: target.id,
          title: target.title,
          kind: "challenge",
          existingWorkItem: finalWorkItem,
        });
        expect(
          challengeWorkItem,
          `Tina did not return a challenge result for "${target.title}".`
        );
        finalWorkItem = challengeWorkItem;
        draft = upsertAuthorityWorkItem(draft, challengeWorkItem);
        accessToken = await getAccessToken(page);
        draft = await saveWorkspace(BASE_URL, accessToken, draft);
      }

      researchRuns.push({
        id: target.id,
        title: target.title,
        goal: target.goal,
        workItem: finalWorkItem,
      });

      logNote(
        `Tina finished "${target.title}" with reviewer state "${finalWorkItem.reviewerDecision}" and challenge verdict "${finalWorkItem.challengeVerdict}".`
      );
    }

    expect(
      researchRuns.length > 0,
      `Tina did not complete any research runs for the ${FIXTURE_SET} business.`
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    try {
      await page.getByText("Today with Tina", { exact: true }).waitFor({ timeout: 60000 });
    } catch {
      await page.goto(`${BASE_URL}/tina`, { waitUntil: "domcontentloaded" });
      await page.getByText("Today with Tina", { exact: true }).waitFor({ timeout: 60000 });
    }
    await waitForQuiet(page);
    await page.getByRole("button", { name: /Show deeper Tina tools|Hide deeper Tina tools/i }).click();
    await waitForQuiet(page);
    await screenshot(page, "05-after-research-results.png");

    const researchRunsWithChallenge = researchRuns.filter((run) => run.workItem.lastChallengeRunAt);
    expect(
      researchRuns.some((run) => run.workItem.lastAiRunAt),
      "Tina did not finish any deep research runs for the surfaced ideas."
    );
    expect(
      researchRunsWithChallenge.some((run) =>
        ["needs_care", "likely_fails"].includes(run.workItem.challengeVerdict) ||
        run.workItem.reviewerDecision === "do_not_use"
      ),
      "Tina did not produce any caution or failure verdicts across the challenged fringe ideas."
    );

    accessToken = await getAccessToken(page);
    const workpaperPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/workpapers/build", {
      body: { draft },
    });
    draft.workpapers = workpaperPayload.workpapers;

    const cleanupPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/cleanup-plan/build", {
      body: { draft },
    });
    draft.cleanupPlan = createReviewedCleanupPlan(cleanupPayload.cleanupPlan);

    const aiCleanupPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/ai-cleanup/build", {
      body: { draft },
    });
    draft.aiCleanup = aiCleanupPayload.aiCleanup;

    const taxAdjustmentPayload = await apiRequest(
      BASE_URL,
      accessToken,
      "/api/tina/tax-adjustments/build",
      {
        body: { draft },
      }
    );
    const generatedTaxAdjustments = taxAdjustmentPayload.taxAdjustments;

    const linkedAdjustments = generatedTaxAdjustments.adjustments.filter((adjustment) =>
      adjustment.authorityWorkIdeaIds.some((ideaId) =>
        researchRuns.some((run) => run.id === ideaId && run.goal === "authority gate")
      )
    );
    if (linkedAdjustments.length > 0) {
      expect(
        linkedAdjustments.every((adjustment) =>
          ["needs_authority", "rejected"].includes(adjustment.status)
        ),
        `Tina let a linked authority-sensitive tax adjustment move too far: ${linkedAdjustments
          .map((adjustment) => `${adjustment.title}=${adjustment.status}`)
          .join(", ")}`
      );
    } else {
      logNote(
        "Tina did not create any authority-sensitive tax adjustments tied to the challenged ideas in this run."
      );
    }

    draft.taxAdjustments = createReviewedTaxAdjustments(generatedTaxAdjustments);

    const reviewerFinalPayload = await apiRequest(
      BASE_URL,
      accessToken,
      "/api/tina/reviewer-final/build",
      {
        body: { draft },
      }
    );
    draft.reviewerFinal = reviewerFinalPayload.reviewerFinal;

    const scheduleCPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/schedule-c/build", {
      body: { draft },
    });
    draft.scheduleCDraft = scheduleCPayload.scheduleCDraft;

    const packageReadinessPayload = await apiRequest(
      BASE_URL,
      accessToken,
      "/api/tina/package-readiness/build",
      {
        body: { draft },
      }
    );
    draft.packageReadiness = packageReadinessPayload.packageReadiness;

    const cpaHandoffPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/cpa-handoff/build", {
      body: { draft },
    });
    draft.cpaHandoff = cpaHandoffPayload.cpaHandoff;
    let cpaExportPayload = null;
    if (draft.cpaHandoff.status === "complete") {
      cpaExportPayload = await apiRequest(BASE_URL, accessToken, "/api/tina/cpa-packet/export", {
        body: { draft },
      });
      expect(
        typeof cpaExportPayload.contents === "string" && cpaExportPayload.contents.length > 0,
        "Tina did not return CPA packet contents."
      );

      const stressTextPresent =
        cpaExportPayload.contents.includes("Stress test:") &&
        cpaExportPayload.contents.includes("Stress-test note:");
      expect(
        stressTextPresent,
        "Tina's CPA export did not carry the stress-test story into the reviewer packet."
      );
    } else {
      logNote(
        `Tina did not build a CPA handoff packet for this fringe run. Status: ${draft.cpaHandoff.status}. ${draft.cpaHandoff.summary}`
      );
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "authority-work-runs.json"),
      JSON.stringify(researchRuns, null, 2),
      "utf8"
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "tax-adjustments.json"),
      JSON.stringify(generatedTaxAdjustments, null, 2),
      "utf8"
    );
    if (cpaExportPayload) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, cpaExportPayload.fileName ?? "tina-cpa-packet.md"),
        cpaExportPayload.contents,
        "utf8"
      );
    }

    const linkedAdjustmentLines = linkedAdjustments.map(
      (adjustment) => `- ${adjustment.title}: ${adjustment.status}`
    );

    const researchRunLines = researchRuns.flatMap((run) => [
      `- ${run.title} (${run.goal})`,
      `  Reviewer state: ${run.workItem.reviewerDecision}`,
      `  Work status: ${run.workItem.status}`,
      `  Challenge verdict: ${run.workItem.challengeVerdict}`,
      `  Disclosure: ${run.workItem.disclosureDecision}`,
      `  Memo: ${run.workItem.challengeMemo || run.workItem.memo || "None saved"}`,
      run.workItem.challengeWarnings.length > 0
        ? `  Weak spots: ${run.workItem.challengeWarnings.join(" | ")}`
        : "  Weak spots: none listed",
      run.workItem.challengeQuestions.length > 0
        ? `  Reviewer questions: ${run.workItem.challengeQuestions.join(" | ")}`
        : "  Reviewer questions: none listed",
    ]);

    const summary = [
      "# Tina Research Flow Check",
      "",
      `Base URL: ${BASE_URL}`,
      `Fixture set: ${FIXTURE_SET}`,
      `Fixture pack: ${FIXTURE_DIR}`,
      `Business: ${manifest.business_name}`,
      "",
      "## Research runs",
      ...researchRunLines,
      "",
      "## Linked tax adjustments",
      ...linkedAdjustmentLines,
      "",
      "## Package path",
      `- Workpapers status: ${draft.workpapers.status}`,
      `- Reviewer-final status: ${draft.reviewerFinal.status}`,
      `- CPA handoff status: ${draft.cpaHandoff.status}`,
      `- Package readiness level: ${draft.packageReadiness.level}`,
      `- Schedule C status: ${draft.scheduleCDraft.status}`,
      "",
      "## Notes",
      ...notes,
      "",
      "## Artifacts",
      "- 01-initial.png",
      "- 02-after-basic-answers.png",
      "- 03-after-reading-papers.png",
      "- 04-after-review-passes.png",
      "- 05-after-research-results.png",
      "- authority-work-runs.json",
      "- tax-adjustments.json",
      ...(cpaExportPayload ? [`- ${cpaExportPayload.fileName ?? "tina-cpa-packet.md"}`] : []),
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
  console.error("[tina-research-flow-check] Failed:", error);
  process.exitCode = 1;
});
