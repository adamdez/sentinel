import { NextResponse } from "next/server";

const SPOKANE_SUPERIOR_COURT_VIEWER =
  "https://cp.spokanecounty.org/courtdocumentviewer/PublicViewer/SCAllCasesByCaseNumber.aspx";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractHiddenInput(html: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<input[^>]*name=["']${escapedName}["'][^>]*value=["']([^"']*)["']`,
    "i",
  );
  return html.match(regex)?.[1] ?? null;
}

function buildFallbackUrl(rawFallbackUrl: string | null, caseNumber: string): string {
  if (rawFallbackUrl) return rawFallbackUrl;
  return `${SPOKANE_SUPERIOR_COURT_VIEWER}?case=${encodeURIComponent(caseNumber)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const court = searchParams.get("court");
  const caseNumber = searchParams.get("caseNumber")?.trim();
  const fallbackUrl = searchParams.get("fallbackUrl");

  if (court !== "spokane-superior" || !caseNumber) {
    return NextResponse.redirect(fallbackUrl || SPOKANE_SUPERIOR_COURT_VIEWER);
  }

  try {
    const response = await fetch(SPOKANE_SUPERIOR_COURT_VIEWER, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "user-agent": "Mozilla/5.0 Sentinel Court Link Bridge",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.redirect(buildFallbackUrl(fallbackUrl, caseNumber));
    }

    const html = await response.text();
    const viewState = extractHiddenInput(html, "__VIEWSTATE");
    const viewStateGenerator = extractHiddenInput(html, "__VIEWSTATEGENERATOR");
    const eventValidation = extractHiddenInput(html, "__EVENTVALIDATION");

    if (!viewState || !viewStateGenerator || !eventValidation) {
      return NextResponse.redirect(buildFallbackUrl(fallbackUrl, caseNumber));
    }

    const safeCaseNumber = escapeHtml(caseNumber);
    const safeViewerUrl = escapeHtml(SPOKANE_SUPERIOR_COURT_VIEWER);
    const safeViewState = escapeHtml(viewState);
    const safeViewStateGenerator = escapeHtml(viewStateGenerator);
    const safeEventValidation = escapeHtml(eventValidation);
    const safeFallbackUrl = escapeHtml(buildFallbackUrl(fallbackUrl, caseNumber));

    const bridgeHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening Spokane County court filing...</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1220;
        color: #f5f7fb;
      }
      main {
        width: min(32rem, calc(100vw - 2rem));
        padding: 1.5rem;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.125rem;
      }
      p {
        margin: 0 0 0.75rem;
        line-height: 1.5;
        color: rgba(245,247,251,0.82);
      }
      code {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
      }
      a, button {
        color: inherit;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-top: 1rem;
      }
      .primary, .secondary {
        border-radius: 999px;
        padding: 0.75rem 1rem;
        font: inherit;
        cursor: pointer;
        text-decoration: none;
      }
      .primary {
        border: none;
        background: #f6c454;
        color: #111827;
        font-weight: 600;
      }
      .secondary {
        border: 1px solid rgba(255,255,255,0.18);
        background: transparent;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Opening Spokane County Superior Court</h1>
      <p>Sending case <code>${safeCaseNumber}</code> into the Spokane County court viewer now.</p>
      <p>If the county site does not open automatically, use the button below.</p>
      <form id="court-bridge" method="post" action="${safeViewerUrl}">
        <input type="hidden" name="__EVENTTARGET" value="" />
        <input type="hidden" name="__EVENTARGUMENT" value="" />
        <input type="hidden" name="__VIEWSTATE" value="${safeViewState}" />
        <input type="hidden" name="__VIEWSTATEGENERATOR" value="${safeViewStateGenerator}" />
        <input type="hidden" name="__EVENTVALIDATION" value="${safeEventValidation}" />
        <input type="hidden" name="ctl00$MainContent$txbCaseNumber" value="${safeCaseNumber}" />
        <input type="hidden" name="txbFName" value="" />
        <input type="hidden" name="ctl00$MainContent$btnSearch" value="GO" />
        <div class="actions">
          <button class="primary" type="submit">Open Court Filing</button>
          <a class="secondary" href="${safeFallbackUrl}" rel="noreferrer">Open Court Viewer Instead</a>
        </div>
      </form>
      <script>
        window.setTimeout(function () {
          document.getElementById("court-bridge")?.submit();
        }, 150);
      </script>
    </main>
  </body>
</html>`;

    return new Response(bridgeHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.redirect(buildFallbackUrl(fallbackUrl, caseNumber));
  }
}
