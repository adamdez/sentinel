import { canConfirmTinaFinalSignoff } from "@/tina/lib/final-signoff";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaPacketIdentity, getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import { buildTinaPacketReviewHtmlBlock } from "@/tina/lib/packet-review-export";
import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";
import type { TinaWorkspaceDraft } from "@/tina/types";

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

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function statusClass(
  status: "ready" | "waiting" | "blocked" | "needs_review" | "ready_for_cpa"
): string {
  switch (status) {
    case "ready":
    case "ready_for_cpa":
      return "ok";
    case "waiting":
    case "needs_review":
      return "watch";
    default:
      return "stop";
  }
}

function formatCategory(value: string): string {
  return value.replace(/_/g, " ");
}

function renderListItems(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export interface TinaReviewPacketHtmlExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaReviewPacketHtmlExport(
  draft: TinaWorkspaceDraft,
  options?: { packetReview?: TinaStoredPacketReviewState | null }
): TinaReviewPacketHtmlExport {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const handoff = draft.cpaHandoff;
  const signoff = draft.finalSignoff;
  const generatedAt = new Date().toISOString();
  const packetIdentity = buildTinaPacketIdentity(draft);
  const packetTag = getTinaPacketFileTag(draft);

  const documentReadings = new Map(
    draft.documentReadings.map((reading) => [reading.documentId, reading.status])
  );

  const artifactCards = handoff.artifacts.length
    ? handoff.artifacts
        .map(
          (artifact) => `
            <article class="panel">
              <div class="row row-spread">
                <div>
                  <h3>${escapeHtml(artifact.title)}</h3>
                  <p class="muted">${escapeHtml(artifact.summary)}</p>
                </div>
                <span class="badge ${statusClass(artifact.status)}">${escapeHtml(artifact.status)}</span>
              </div>
              ${
                artifact.includes.length > 0
                  ? `<ul class="chip-list">${artifact.includes
                      .map((item) => `<li class="chip">${escapeHtml(item)}</li>`)
                      .join("")}</ul>`
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<article class="panel"><p class="muted">Tina has not laid out the CPA handoff packet yet.</p></article>`;

  const scheduleRows = draft.scheduleCDraft.fields.length
    ? draft.scheduleCDraft.fields
        .map(
          (field) => `
            <tr>
              <td>${escapeHtml(field.lineNumber)}</td>
              <td>${escapeHtml(field.label)}</td>
              <td>${escapeHtml(formatMoney(field.amount))}</td>
              <td><span class="badge ${statusClass(field.status === "needs_attention" ? "needs_review" : field.status)}">${escapeHtml(field.status)}</span></td>
              <td>${escapeHtml(field.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">Tina has not built Schedule C fields yet.</td></tr>`;

  const noteRows = draft.scheduleCDraft.notes.length
    ? draft.scheduleCDraft.notes
        .map(
          (note) => `
            <tr>
              <td>${escapeHtml(note.title)}</td>
              <td><span class="badge ${statusClass(note.severity === "needs_attention" ? "needs_review" : "ready")}">${escapeHtml(note.severity)}</span></td>
              <td>${escapeHtml(note.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3">Tina does not have extra draft notes right now.</td></tr>`;

  const openItems = draft.packageReadiness.items.length
    ? draft.packageReadiness.items
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.title)}</td>
              <td><span class="badge ${statusClass(item.severity === "needs_attention" ? "needs_review" : "blocked")}">${escapeHtml(item.severity)}</span></td>
              <td>${escapeHtml(item.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3">Tina does not see open filing-package items right now.</td></tr>`;

  const savedPapers = draft.documents.length
    ? draft.documents
        .map((document) => {
          const readStatus = documentReadings.get(document.id) === "complete" ? "Read" : "Unread";
          return `
            <tr>
              <td>${escapeHtml(document.name)}</td>
              <td>${escapeHtml(formatCategory(document.category))}</td>
              <td>${escapeHtml(document.requestLabel ?? "General support")}</td>
              <td>${escapeHtml(readStatus)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4">No saved papers yet.</td></tr>`;

  const authorityRows = draft.authorityWork.length
    ? draft.authorityWork
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.ideaId)}</td>
              <td>${escapeHtml(item.status)}</td>
              <td>${escapeHtml(item.reviewerDecision)}</td>
              <td>${escapeHtml(item.challengeVerdict.replace(/_/g, " "))}</td>
              <td>${item.citations.length}</td>
              <td>${escapeHtml(item.challengeWarnings[0] ?? item.missingAuthority[0] ?? "No saved warning yet.")}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6">No saved authority work items yet.</td></tr>`;

  const signoffChecks = signoff.checks.length
    ? signoff.checks
        .map(
          (check) => `
            <li class="check-item">
              <span class="check-state">${check.checked ? "Done" : "Open"}</span>
              <div>
                <strong>${escapeHtml(check.label)}</strong>
                <p class="muted">${escapeHtml(check.helpText)}</p>
              </div>
            </li>
          `
        )
        .join("")
    : `<li class="check-item"><div><strong>No final checks yet.</strong></div></li>`;

  const contents = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`Tina review packet - ${businessName}`)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f4ed;
        --card: #fffdf7;
        --ink: #1d1a16;
        --muted: #665f56;
        --line: #d8d0c3;
        --ok: #dff4df;
        --ok-ink: #245b28;
        --watch: #fff0c2;
        --watch-ink: #7a5600;
        --stop: #ffe0dc;
        --stop-ink: #8a261d;
        --accent: #7b4f2a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Georgia", "Times New Roman", serif;
        background: var(--bg);
        color: var(--ink);
        line-height: 1.5;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 40px 24px 64px;
      }
      header {
        background: linear-gradient(140deg, #efe7d4, #fffaf0);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 28px;
        margin-bottom: 24px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        font-size: 34px;
        line-height: 1.1;
        margin-bottom: 8px;
      }
      h2 {
        font-size: 22px;
        margin-bottom: 14px;
      }
      h3 {
        font-size: 17px;
        margin-bottom: 6px;
      }
      section {
        margin-top: 22px;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .panel {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px 20px;
      }
      .row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .row-spread {
        justify-content: space-between;
      }
      .muted {
        color: var(--muted);
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
      .badge.ok {
        background: var(--ok);
        color: var(--ok-ink);
      }
      .badge.watch {
        background: var(--watch);
        color: var(--watch-ink);
      }
      .badge.stop {
        background: var(--stop);
        color: var(--stop-ink);
      }
      .chip-list {
        list-style: none;
        padding: 0;
        margin: 12px 0 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        padding: 6px 10px;
        border-radius: 999px;
        background: #f3eee3;
        border: 1px solid var(--line);
        font-size: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 22px;
        overflow: hidden;
      }
      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }
      th {
        background: #f3eee3;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      tr:last-child td {
        border-bottom: none;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      .check-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 12px;
      }
      .check-item {
        display: grid;
        grid-template-columns: 76px 1fr;
        gap: 12px;
        align-items: start;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--card);
      }
      .check-state {
        display: inline-flex;
        justify-content: center;
        padding: 5px 10px;
        border-radius: 999px;
        background: #f3eee3;
        border: 1px solid var(--line);
        font-size: 12px;
        font-weight: 700;
      }
      .footer-note {
        margin-top: 28px;
        padding: 18px 20px;
        border-radius: 18px;
        background: #efe7d4;
        border: 1px solid var(--line);
      }
      @media print {
        body { background: white; }
        main { max-width: none; padding: 0; }
        .panel, table, header, .footer-note, .check-item { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <span class="badge ${statusClass(draft.packageReadiness.level)}">${escapeHtml(
          draft.packageReadiness.level.replace(/_/g, " ")
        )}</span>
        <h1>${escapeHtml(`Tina review packet for ${businessName}`)}</h1>
        <p class="muted" style="margin-top: 8px;">Packet ID ${escapeHtml(
          packetIdentity.packetId
        )} | ${escapeHtml(packetIdentity.packetVersion)}</p>
        <p class="muted">Tax year ${escapeHtml(taxYear)} · ${escapeHtml(
          lane.title
        )} · Generated ${escapeHtml(generatedAt)}</p>
        <p style="margin-top: 14px;">Tina kept this packet plain on purpose so a reviewer can scan what is ready, what still needs care, and which papers support the work.</p>
      </header>

      <section class="grid two">
        <article class="panel">
          <h2>Package check</h2>
          <p>${escapeHtml(draft.packageReadiness.summary)}</p>
          <p class="muted" style="margin-top: 10px;">${escapeHtml(draft.packageReadiness.nextStep)}</p>
        </article>
        <article class="panel">
          <div class="row row-spread">
            <div>
              <h2>Final signoff</h2>
              <p>${escapeHtml(signoff.summary)}</p>
            </div>
            <span class="badge ${statusClass(signoff.level === "ready" ? "ready" : signoff.level === "waiting" ? "waiting" : "blocked")}">${escapeHtml(
              signoff.level
            )}</span>
          </div>
          <p class="muted" style="margin-top: 10px;">${escapeHtml(signoff.nextStep)}</p>
          <p class="muted" style="margin-top: 10px;">Reviewer: ${escapeHtml(
            signoff.reviewerName || "Not added yet"
          )}</p>
          <p class="muted">Confirmed: ${escapeHtml(
            signoff.confirmedAt ?? "Not confirmed yet"
          )}</p>
          <p class="muted">Confirmed packet: ${escapeHtml(
            signoff.confirmedPacketId && signoff.confirmedPacketVersion
              ? `${signoff.confirmedPacketId} (${signoff.confirmedPacketVersion})`
              : "Not pinned yet"
          )}</p>
          <p class="muted">Confirmation ready: ${canConfirmTinaFinalSignoff(signoff) ? "Yes" : "No"}</p>
          ${
            signoff.reviewerNote
              ? `<p class="muted" style="margin-top: 10px;">Reviewer note: ${escapeHtml(
                  signoff.reviewerNote
                )}</p>`
              : ""
          }
        </article>
      </section>

      <section>
        ${buildTinaPacketReviewHtmlBlock(options?.packetReview)}
      </section>

      <section>
        <h2>CPA handoff sections</h2>
        <div class="grid">
          ${artifactCards}
        </div>
      </section>

      <section>
        <h2>Schedule C draft</h2>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Label</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Why Tina mapped it this way</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Draft notes</h2>
        <table>
          <thead>
            <tr>
              <th>Note</th>
              <th>Severity</th>
              <th>What Tina still wants checked</th>
            </tr>
          </thead>
          <tbody>${noteRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Open package items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Severity</th>
              <th>Why it still matters</th>
            </tr>
          </thead>
          <tbody>${openItems}</tbody>
        </table>
      </section>

      <section>
        <h2>Saved papers</h2>
        <table>
          <thead>
            <tr>
              <th>Paper</th>
              <th>Category</th>
              <th>Why Tina asked for it</th>
              <th>Tina read</th>
            </tr>
          </thead>
          <tbody>${savedPapers}</tbody>
        </table>
      </section>

      <section>
        <h2>Authority work</h2>
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Status</th>
              <th>Reviewer call</th>
              <th>Stress test</th>
              <th>Citations</th>
              <th>Top warning</th>
            </tr>
          </thead>
          <tbody>${authorityRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Final signoff checklist</h2>
        <ul class="check-list">${signoffChecks}</ul>
      </section>

      <section class="footer-note">
        <strong>Tina note</strong>
        <p style="margin-top: 8px;">This is a review packet, not a filed return. It belongs with the source papers, reviewer notes, and final human approval.</p>
      </section>
    </main>
  </body>
</html>`;

  return {
    fileName: `tina-review-packet-${slug}-${taxYear}-${packetTag}.html`,
    mimeType: "text/html; charset=utf-8",
    contents,
  };
}
