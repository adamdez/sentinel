import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSavedAt(value: string | null): string {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTinaPacketReviewDecision(
  decision: TinaStoredPacketReviewState["decision"]
): string {
  switch (decision) {
    case "reference_only":
      return "Keep as reference";
    case "needs_follow_up":
      return "Needs follow-up";
    case "approved_for_handoff":
      return "Looks ready";
    default:
      return "Not reviewed yet";
  }
}

export function buildTinaPacketReviewMarkdownLines(
  review?: TinaStoredPacketReviewState | null
): string[] {
  if (!review) {
    return ["- Tina does not have a saved packet review trail for this export."];
  }

  const lines = [
    `- Review decision: ${formatTinaPacketReviewDecision(review.decision)}`,
    `- Reviewed at: ${formatSavedAt(review.reviewedAt)}`,
    `- Reviewer: ${review.reviewerName || "Not added yet"}`,
    `- Reviewer note: ${review.reviewerNote || "No reviewer note yet."}`,
  ];

  if (review.events.length > 0) {
    lines.push("- Review history:");
    review.events.forEach((event) => {
      lines.push(
        `  - ${formatSavedAt(event.at)} / ${formatTinaPacketReviewDecision(event.decision)} / ${event.reviewerName || "Unknown reviewer"}`
      );
      if (event.reviewerNote) {
        lines.push(`    - ${event.reviewerNote}`);
      }
    });
  }

  return lines;
}

function reviewTone(review?: TinaStoredPacketReviewState | null): "ok" | "watch" | "stop" {
  switch (review?.decision) {
    case "approved_for_handoff":
      return "ok";
    case "needs_follow_up":
      return "watch";
    default:
      return "stop";
  }
}

export function buildTinaPacketReviewHtmlBlock(
  review?: TinaStoredPacketReviewState | null
): string {
  if (!review) {
    return `
      <article class="panel">
        <h2>Saved packet review</h2>
        <p class="muted">This export is not tied to a saved packet review trail yet.</p>
      </article>
    `;
  }

  const history =
    review.events.length > 0
      ? `
        <div class="review-history">
          ${review.events
            .map(
              (event) => `
                <div class="review-history-item">
                  <strong>${escapeHtml(formatTinaPacketReviewDecision(event.decision))}</strong>
                  <p class="muted">${escapeHtml(
                    `${formatSavedAt(event.at)} / ${event.reviewerName || "Unknown reviewer"}`
                  )}</p>
                  ${
                    event.reviewerNote
                      ? `<p class="muted">${escapeHtml(event.reviewerNote)}</p>`
                      : ""
                  }
                </div>
              `
            )
            .join("")}
        </div>
      `
      : `<p class="muted">No saved packet review events yet.</p>`;

  return `
    <article class="panel">
      <div class="row row-spread">
        <div>
          <h2>Saved packet review</h2>
          <p>${escapeHtml(formatTinaPacketReviewDecision(review.decision))}</p>
        </div>
        <span class="badge ${reviewTone(review)}">${escapeHtml(
          formatTinaPacketReviewDecision(review.decision)
        )}</span>
      </div>
      <p class="muted" style="margin-top: 10px;">Reviewed: ${escapeHtml(
        formatSavedAt(review.reviewedAt)
      )}</p>
      <p class="muted">Reviewer: ${escapeHtml(review.reviewerName || "Not added yet")}</p>
      <p class="muted">Note: ${escapeHtml(review.reviewerNote || "No reviewer note yet.")}</p>
      ${history}
    </article>
  `;
}
