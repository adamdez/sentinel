import type { TinaOfficialFormDraft, TinaWorkspaceDraft } from "@/tina/types";
import { buildTinaPacketIdentity, getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import { canExportTinaOfficialFormPacket } from "@/tina/lib/official-form-coverage";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusClass(status: "ready" | "needs_review" | "blocked"): string {
  switch (status) {
    case "ready":
      return "ok";
    case "needs_review":
      return "watch";
    default:
      return "stop";
  }
}

function lineStateLabel(state: "filled" | "review" | "blank"): string {
  switch (state) {
    case "filled":
      return "filled";
    case "review":
      return "needs review";
    default:
      return "blank";
  }
}

function lineStateClass(state: "filled" | "review" | "blank"): string {
  switch (state) {
    case "filled":
      return "ok";
    case "review":
      return "watch";
    default:
      return "blank";
  }
}

function getFormBanner(
  form: TinaOfficialFormDraft
): { tone: "watch" | "stop"; title: string; summary: string } | null {
  if (form.status === "ready") return null;

  if (form.status === "blocked") {
    return {
      tone: "stop",
      title: "Blocked - do not file",
      summary:
        "Tina made a paperwork preview, but blockers still exist. A human must fix them before this can be treated like filing-ready paperwork.",
    };
  }

  return {
    tone: "watch",
    title: "Draft - review required",
    summary:
      "Tina made a paperwork preview, but a human still needs to review the flagged lines and notes before this should be treated like filing-ready paperwork.",
  };
}

function renderForm(form: TinaOfficialFormDraft): string {
  const banner = getFormBanner(form);

  return `
    <section class="form-card">
      ${
        banner
          ? `<div class="warning-banner ${banner.tone}">
              <strong>${escapeHtml(banner.title)}</strong>
              <p>${escapeHtml(banner.summary)}</p>
            </div>`
          : ""
      }
      <div class="form-head">
        <div>
          <p class="eyebrow">${escapeHtml(form.formNumber)} · Tax year ${escapeHtml(form.taxYear)}</p>
          <h2>${escapeHtml(form.title)}</h2>
          <p class="muted">${escapeHtml(form.summary)}</p>
          <p class="muted">${escapeHtml(form.nextStep)}</p>
        </div>
        <span class="badge ${statusClass(form.status)}">${escapeHtml(
          form.status.replace(/_/g, " ")
        )}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>What goes here</th>
            <th>Value</th>
            <th>Status</th>
            <th>Tina note</th>
          </tr>
        </thead>
        <tbody>
          ${form.lines
            .map(
              (line) => `
                <tr>
                  <td>${escapeHtml(line.lineNumber)}</td>
                  <td>${escapeHtml(line.label)}</td>
                  <td>${escapeHtml(line.value || " ")}</td>
                  <td><span class="badge ${lineStateClass(line.state)}">${escapeHtml(
                    lineStateLabel(line.state)
                  )}</span></td>
                  <td>${escapeHtml(line.summary)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      ${
        form.supportSchedules.length > 0
          ? form.supportSchedules
              .map(
                (schedule) => `
                  <section class="support-card">
                    <h3>${escapeHtml(schedule.title)}</h3>
                    <p class="muted">${escapeHtml(schedule.summary)}</p>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Amount</th>
                          <th>Tina note</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${schedule.rows
                          .map(
                            (row) => `
                              <tr>
                                <td>${escapeHtml(row.label)}</td>
                                <td>${escapeHtml(
                                  row.amount === null
                                    ? "Blank for now"
                                    : new Intl.NumberFormat("en-US", {
                                        style: "currency",
                                        currency: "USD",
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                      }).format(row.amount)
                                )}</td>
                                <td>${escapeHtml(row.summary)}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </section>
                `
              )
              .join("")
          : ""
      }
    </section>
  `;
}

export interface TinaOfficialFormExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaOfficialFormExport(draft: TinaWorkspaceDraft): TinaOfficialFormExport {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const packet = draft.officialFormPacket;
  const packetIsExportReady = canExportTinaOfficialFormPacket(draft);
  const packetIdentity = buildTinaPacketIdentity(draft);
  const packetTag = getTinaPacketFileTag(draft);
  const packetNote = packetIsExportReady
    ? "This is Tina's exact supported federal business form packet for the Schedule C lane. It still attaches to the owner's Form 1040 or 1040-SR and does not replace the rest of the individual return or IRS e-file steps."
    : "This is a blocked federal business form preview only. Tina should not treat it like the finished IRS-facing packet until every required companion business form in scope is covered.";

  const contents = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`Tina official form packet - ${businessName}`)}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #fffdf8;
        --bg: #f3efe6;
        --ink: #1f1b17;
        --muted: #655d52;
        --line: #d8cfbf;
        --ok: #e0f3df;
        --ok-ink: #255a2a;
        --watch: #fff0c7;
        --watch-ink: #7b5800;
        --stop: #ffe0db;
        --stop-ink: #85251f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Georgia", serif;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 36px 20px 60px;
      }
      header, .form-card, .note {
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 24px;
      }
      header {
        padding: 24px;
        margin-bottom: 20px;
      }
      h1, h2, p { margin: 0; }
      h1 {
        font-size: 32px;
        line-height: 1.1;
        margin-top: 10px;
      }
      h2 {
        font-size: 22px;
      }
      .eyebrow, .muted {
        color: var(--muted);
      }
      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 700;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        white-space: nowrap;
      }
      .badge.ok { background: var(--ok); color: var(--ok-ink); }
      .badge.watch { background: var(--watch); color: var(--watch-ink); }
      .badge.stop, .badge.blank { background: var(--stop); color: var(--stop-ink); }
      .form-card {
        padding: 22px;
        margin-top: 18px;
      }
      .support-card {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .warning-banner {
        margin-bottom: 16px;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
      }
      .warning-banner strong {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .warning-banner.watch {
        background: var(--watch);
        color: var(--watch-ink);
      }
      .warning-banner.stop {
        background: var(--stop);
        color: var(--stop-ink);
      }
      .form-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-top: 1px solid var(--line);
        padding: 12px 10px;
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }
      th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .note {
        padding: 18px 20px;
        margin-top: 20px;
      }
      @media print {
        body { background: white; }
        main { max-width: none; padding: 0; }
        header, .form-card, .note { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <span class="badge ${packet.forms[0] ? statusClass(packet.forms[0].status) : "stop"}">${escapeHtml(
          packet.forms[0]?.status.replace(/_/g, " ") ?? "blocked"
        )}</span>
        <h1>${escapeHtml(`Tina federal business form packet for ${businessName}`)}</h1>
        <p class="muted">Tax year ${escapeHtml(taxYear)}</p>
        <p class="muted" style="margin-top: 8px;">Packet ID ${escapeHtml(
          packetIdentity.packetId
        )} · ${escapeHtml(packetIdentity.packetVersion)}</p>
        <p style="margin-top: 12px;">${escapeHtml(packet.summary)}</p>
        <p class="muted" style="margin-top: 8px;">${escapeHtml(packet.nextStep)}</p>
      </header>
      ${packet.forms.length > 0
        ? packet.forms.map((form) => renderForm(form)).join("")
        : `<section class="form-card"><p>Tina does not have a supported official-form packet yet.</p></section>`}
      <section class="note">
        <strong>Tina note</strong>
        <p style="margin-top: 8px;">${escapeHtml(packetNote)}</p>
      </section>
    </main>
  </body>
</html>`;

  return {
    fileName: `tina-official-form-packet-${slug}-${taxYear}-${packetTag}.html`,
    mimeType: "text/html; charset=utf-8",
    contents,
  };
}
