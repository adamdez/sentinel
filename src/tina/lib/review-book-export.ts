import { buildTinaArtifactManifest } from "@/tina/lib/artifact-manifest";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaPacketIdentity, getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import { buildTinaPacketReviewHtmlBlock } from "@/tina/lib/packet-review-export";
import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";
import type { TinaOfficialFormDraft, TinaWorkspaceDraft } from "@/tina/types";

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

function statusClass(status: "ready" | "waiting" | "blocked" | "needs_review" | "ready_for_cpa") {
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

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
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
        "This packet still has blocked paperwork lines. A human must fix them before anyone should treat this like filing-ready paperwork.",
    };
  }

  return {
    tone: "watch",
    title: "Draft - review required",
    summary:
      "This packet still has flagged paperwork lines. A human still needs to review them before this should be treated like filing-ready paperwork.",
  };
}

function renderOfficialForm(form: TinaOfficialFormDraft): string {
  const banner = getFormBanner(form);

  return `
    <article class="form-card">
      ${
        banner
          ? `<div class="warning-banner ${banner.tone}">
              <strong>${escapeHtml(banner.title)}</strong>
              <p>${escapeHtml(banner.summary)}</p>
            </div>`
          : ""
      }
      <div class="row spread">
        <div>
          <p class="eyebrow">${escapeHtml(form.formNumber)} | Tax year ${escapeHtml(form.taxYear)}</p>
          <h3>${escapeHtml(form.title)}</h3>
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
            <th>What Tina filled</th>
            <th>Value</th>
            <th>Status</th>
            <th>Note</th>
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
                  <td><span class="badge ${statusClass(
                    line.state === "filled" ? "ready" : line.state === "review" ? "needs_review" : "blocked"
                  )}">${escapeHtml(lineStateLabel(line.state))}</span></td>
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
                  <div class="support-card">
                    <h4>${escapeHtml(schedule.title)}</h4>
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
                                <td>${escapeHtml(formatMoney(row.amount))}</td>
                                <td>${escapeHtml(row.summary)}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `
              )
              .join("")
          : ""
      }
    </article>
  `;
}

export interface TinaReviewBookExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaReviewBookExport(
  draft: TinaWorkspaceDraft,
  options?: { packetReview?: TinaStoredPacketReviewState | null }
): TinaReviewBookExport {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const generatedAt = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const manifest = buildTinaArtifactManifest(draft);
  const handoff = draft.cpaHandoff;
  const signoff = draft.finalSignoff;
  const packetIdentity = buildTinaPacketIdentity(draft);
  const packetTag = getTinaPacketFileTag(draft);

  const sourceReadMap = new Map(
    draft.documentReadings.map((reading) => [reading.documentId, reading.status === "complete"])
  );

  const manifestRows = manifest.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td>${escapeHtml(item.format)}</td>
          <td>${escapeHtml(item.fileName)}</td>
          <td>${escapeHtml(item.delivery.replace(/_/g, " "))}</td>
          <td><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
          <td>${escapeHtml(item.nextStep)}</td>
        </tr>
      `
    )
    .join("");

  const handoffRows = handoff.artifacts.length
    ? handoff.artifacts
        .map(
          (artifact) => `
            <tr>
              <td>${escapeHtml(artifact.title)}</td>
              <td><span class="badge ${statusClass(artifact.status)}">${escapeHtml(artifact.status)}</span></td>
              <td>${escapeHtml(artifact.summary)}</td>
              <td>${escapeHtml(artifact.includes.join(" | ") || "No extra items listed")}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4">Tina has not built the CPA handoff packet yet.</td></tr>`;

  const scheduleRows = draft.scheduleCDraft.fields.length
    ? draft.scheduleCDraft.fields
        .map(
          (field) => `
            <tr>
              <td>${escapeHtml(field.lineNumber)}</td>
              <td>${escapeHtml(field.label)}</td>
              <td>${escapeHtml(formatMoney(field.amount))}</td>
              <td><span class="badge ${statusClass(
                field.status === "needs_attention" ? "needs_review" : field.status
              )}">${escapeHtml(field.status)}</span></td>
              <td>${escapeHtml(field.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">Tina has not built the first Schedule C draft yet.</td></tr>`;

  const openItemsRows = draft.packageReadiness.items.length
    ? draft.packageReadiness.items
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.title)}</td>
              <td><span class="badge ${statusClass(
                item.severity === "blocking" ? "blocked" : "needs_review"
              )}">${escapeHtml(item.severity)}</span></td>
              <td>${escapeHtml(item.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3">Tina does not see any open package items right now.</td></tr>`;

  const sourceRows = draft.documents.length
    ? draft.documents
        .map(
          (document) => `
            <tr>
              <td>${escapeHtml(document.name)}</td>
              <td>${escapeHtml(document.category.replace(/_/g, " "))}</td>
              <td>${escapeHtml(document.requestLabel ?? "General support")}</td>
              <td>${sourceReadMap.get(document.id) ? "Read" : "Unread"}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4">No saved papers yet.</td></tr>`;

  const booksRows = draft.booksImport.documents.length
    ? draft.booksImport.documents
        .map(
          (document) => `
            <tr>
              <td>${escapeHtml(document.name)}</td>
              <td><span class="badge ${statusClass(
                document.status === "ready"
                  ? "ready"
                  : document.status === "needs_attention"
                    ? "needs_review"
                    : "waiting"
              )}">${escapeHtml(document.status.replace(/_/g, " "))}</span></td>
              <td>${escapeHtml(
                document.coverageStart || document.coverageEnd
                  ? `${document.coverageStart ?? "?"} through ${document.coverageEnd ?? "?"}`
                  : "No clear date range yet"
              )}</td>
              <td>${escapeHtml(
                document.moneyIn !== null || document.moneyOut !== null
                  ? `${formatMoney(document.moneyIn)} in / ${formatMoney(document.moneyOut)} out`
                  : "No clean dollar totals yet"
              )}</td>
              <td>${escapeHtml(document.summary)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">Tina has not sorted the books lane yet.</td></tr>`;

  const authorityRows = draft.authorityWork.length
    ? draft.authorityWork
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.ideaId)}</td>
              <td><span class="badge ${statusClass(
                item.status === "reviewed"
                  ? "ready"
                  : item.status === "ready_for_reviewer" || item.status === "researching"
                    ? "needs_review"
                    : item.status === "rejected"
                      ? "blocked"
                      : "waiting"
              )}">${escapeHtml(item.status.replace(/_/g, " "))}</span></td>
              <td>${escapeHtml(item.reviewerDecision.replace(/_/g, " "))}</td>
              <td>${escapeHtml(item.challengeVerdict.replace(/_/g, " "))}</td>
              <td>${escapeHtml(
                item.challengeWarnings[0] ??
                  item.missingAuthority[0] ??
                  (item.memo || "No saved warning yet.")
              )}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">No saved authority work items yet.</td></tr>`;

  const signoffChecks = signoff.checks
    .map(
      (check) => `
        <li class="check-item">
          <span class="badge ${check.checked ? "ok" : "watch"}">${check.checked ? "done" : "open"}</span>
          <div>
            <strong>${escapeHtml(check.label)}</strong>
            <p class="muted">${escapeHtml(check.helpText)}</p>
          </div>
        </li>
      `
    )
    .join("");

  const contents = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`Tina full handoff packet - ${businessName}`)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f2e8;
        --paper: #fffdf8;
        --ink: #1d1a16;
        --muted: #645d54;
        --line: #d8d0c3;
        --ok: #dff4df;
        --ok-ink: #245b28;
        --watch: #fff0c2;
        --watch-ink: #7a5600;
        --stop: #ffe0dc;
        --stop-ink: #8a261d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Georgia", "Times New Roman", serif;
        line-height: 1.5;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 36px 24px 72px;
      }
      header, section, .form-card, .summary-card {
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 24px;
      }
      header {
        padding: 28px;
      }
      section {
        margin-top: 20px;
        padding: 22px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 {
        font-size: 34px;
        line-height: 1.1;
        margin-top: 8px;
      }
      h2 {
        font-size: 24px;
        margin-bottom: 14px;
      }
      h3 {
        font-size: 18px;
        margin-bottom: 6px;
      }
      .eyebrow, .muted {
        color: var(--muted);
      }
      .eyebrow {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }
      .summary-card {
        padding: 18px 20px;
      }
      .row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .spread {
        justify-content: space-between;
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
      .form-card {
        margin-top: 14px;
        padding: 18px;
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
      .check-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 12px;
      }
      .check-item {
        display: grid;
        grid-template-columns: 82px 1fr;
        gap: 12px;
        align-items: start;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: #fbf8f2;
      }
      .note {
        margin-top: 20px;
        padding: 18px 20px;
        border-radius: 18px;
        background: #efe7d4;
        border: 1px solid var(--line);
      }
      @media print {
        body { background: white; }
        main { max-width: none; padding: 0; }
        header, section, .form-card, .summary-card, .check-item, .note { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <span class="badge ${statusClass(draft.packageReadiness.level)}">${escapeHtml(
          draft.packageReadiness.level.replace(/_/g, " ")
        )}</span>
        <h1>${escapeHtml(`Tina full handoff packet for ${businessName}`)}</h1>
        <p class="muted">Packet ID ${escapeHtml(packetIdentity.packetId)} | ${escapeHtml(
          packetIdentity.packetVersion
        )}</p>
        <p class="muted">Tax year ${escapeHtml(taxYear)} | ${escapeHtml(
          lane.title
        )} | Generated ${escapeHtml(generatedAt)}</p>
        <p style="margin-top: 14px;">Tina built this packet to feel like one calm handoff file. It brings together the packet map, the review story, the official form layer, and the human signoff notes.</p>
      </header>

      <section>
        <h2>Packet summary</h2>
        <div class="grid two">
          <article class="summary-card">
            <p class="eyebrow">File map</p>
            <p>${escapeHtml(manifest.summary)}</p>
            <p class="muted" style="margin-top: 10px;">${escapeHtml(manifest.nextStep)}</p>
          </article>
          <article class="summary-card">
            <p class="eyebrow">Final signoff</p>
            <p>${escapeHtml(signoff.summary)}</p>
            <p class="muted" style="margin-top: 10px;">Reviewer: ${escapeHtml(
              signoff.reviewerName || "Not added yet"
            )}</p>
            <p class="muted">Confirmed: ${escapeHtml(signoff.confirmedAt ?? "Not confirmed yet")}</p>
            <p class="muted">Confirmed packet: ${escapeHtml(
              signoff.confirmedPacketId && signoff.confirmedPacketVersion
                ? `${signoff.confirmedPacketId} (${signoff.confirmedPacketVersion})`
                : "Not pinned yet"
            )}</p>
          </article>
        </div>
      </section>

      <section>
        ${buildTinaPacketReviewHtmlBlock(options?.packetReview)}
      </section>

      <section>
        <h2>Packet files</h2>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Format</th>
              <th>Name</th>
              <th>Delivery</th>
              <th>Status</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>${manifestRows}</tbody>
        </table>
      </section>

      <section>
        <h2>CPA handoff sections</h2>
        <p class="muted" style="margin-bottom: 12px;">${escapeHtml(handoff.summary)}</p>
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Status</th>
              <th>Summary</th>
              <th>Included notes</th>
            </tr>
          </thead>
          <tbody>${handoffRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Return draft snapshot</h2>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Label</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Tina note</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Federal business form packet</h2>
        <p class="muted" style="margin-bottom: 12px;">${escapeHtml(draft.officialFormPacket.summary)}</p>
        ${draft.officialFormPacket.forms.length > 0
          ? draft.officialFormPacket.forms.map((form) => renderOfficialForm(form)).join("")
          : `<article class="form-card"><p>Tina does not have a federal business form packet saved yet.</p></article>`}
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
          <tbody>${openItemsRows}</tbody>
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
          <tbody>${sourceRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Books lane</h2>
        <p class="muted" style="margin-bottom: 12px;">${escapeHtml(draft.booksConnection.summary)}</p>
        <p class="muted" style="margin-bottom: 12px;">${escapeHtml(draft.booksImport.summary)}</p>
        <div class="grid two" style="margin-bottom: 14px;">
          <div class="summary-card">
            <p class="eyebrow">Coverage</p>
            <p>${escapeHtml(
              draft.booksImport.coverageStart || draft.booksImport.coverageEnd
                ? `${draft.booksImport.coverageStart ?? "?"} through ${draft.booksImport.coverageEnd ?? "?"}`
                : "Tina still needs a cleaner date range from the books lane."
            )}</p>
          </div>
          <div class="summary-card">
            <p class="eyebrow">Money totals</p>
            <p>${escapeHtml(
              draft.booksImport.moneyInTotal !== null || draft.booksImport.moneyOutTotal !== null
                ? `${formatMoney(draft.booksImport.moneyInTotal)} in / ${formatMoney(draft.booksImport.moneyOutTotal)} out`
                : "Tina still needs a cleaner books read for money totals."
            )}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Books file</th>
              <th>Status</th>
              <th>Coverage</th>
              <th>Money</th>
              <th>Tina note</th>
            </tr>
          </thead>
          <tbody>${booksRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Authority and stress tests</h2>
        <p class="muted" style="margin-bottom: 12px;">Tina's saved legal support, reviewer calls, and "try to prove it wrong" results.</p>
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Work status</th>
              <th>Reviewer call</th>
              <th>Stress test</th>
              <th>Top warning</th>
            </tr>
          </thead>
          <tbody>
            ${authorityRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Final signoff checks</h2>
        <ul class="check-list">${signoffChecks}</ul>
        <div class="note">
          <strong>Tina note</strong>
          <p style="margin-top: 8px;">This is still a reviewer packet, not a filed return. Tina is keeping the paperwork, packet map, and signoff context together so a real human can review without guessing what belongs in the handoff set.</p>
        </div>
      </section>
    </main>
  </body>
</html>`;

  return {
    fileName: `tina-full-handoff-packet-${slug}-${taxYear}-${packetTag}.html`,
    mimeType: "text/html; charset=utf-8",
    contents,
  };
}
