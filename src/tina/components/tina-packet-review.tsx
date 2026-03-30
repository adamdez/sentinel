"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, FolderOpen, Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";
import { buildTinaArtifactManifest } from "@/tina/lib/artifact-manifest";
import { buildTinaPacketComparison } from "@/tina/lib/packet-comparison";
import {
  parseTinaStoredPacketVersion,
  type TinaPacketReviewDecision,
  type TinaStoredPacketVersion,
} from "@/tina/lib/packet-versions";
import {
  createDefaultTinaWorkspaceDraft,
  parseTinaWorkspaceDraft,
} from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function formatSavedAt(value: string | null): string {
  if (!value) return "Unknown save time";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DELIVERY_STYLES = {
  bundle_only: "border-white/10 bg-white/5 text-zinc-200",
  direct: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
  bundle_and_direct: "border-amber-300/18 bg-amber-300/8 text-amber-100",
} as const;

const DELIVERY_LABELS = {
  bundle_only: "bundle only",
  direct: "direct file",
  bundle_and_direct: "bundle + direct",
} as const;

const COMPARISON_STYLES = {
  same: "border-white/10 bg-white/5 text-zinc-100",
  calmer: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
  riskier: "border-rose-300/18 bg-rose-300/8 text-rose-100",
  different: "border-amber-300/18 bg-amber-300/8 text-amber-100",
} as const;

const REVIEW_DECISION_LABELS: Record<TinaPacketReviewDecision, string> = {
  unreviewed: "Not reviewed yet",
  reference_only: "Keep as reference",
  needs_follow_up: "Needs follow-up",
  approved_for_handoff: "Looks ready",
};

const REVIEW_DECISION_STYLES = {
  unreviewed: "border-white/10 bg-white/5 text-zinc-100",
  reference_only: "border-white/10 bg-white/5 text-zinc-100",
  needs_follow_up: "border-amber-300/18 bg-amber-300/8 text-amber-100",
  approved_for_handoff: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
} as const;

type DownloadKind = "bundle" | "review_packet" | "official_pdf" | "handoff" | "cpa_notes";

const DOWNLOAD_LABELS: Record<DownloadKind, string> = {
  bundle: "review bundle",
  review_packet: "review packet",
  official_pdf: "official-form PDF",
  handoff: "full handoff file",
  cpa_notes: "CPA notes",
};

const DOWNLOAD_ROUTES: Record<DownloadKind, string> = {
  bundle: "/api/tina/review-bundle/package",
  review_packet: "/api/tina/review-packet-html/export",
  official_pdf: "/api/tina/official-forms/pdf",
  handoff: "/api/tina/review-book/export",
  cpa_notes: "/api/tina/cpa-packet/export",
};

export function TinaPacketReview({ fingerprint }: { fingerprint: string }) {
  const [savedPacket, setSavedPacket] = useState<TinaStoredPacketVersion | null>(null);
  const [liveDraft, setLiveDraft] = useState<TinaWorkspaceDraft | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadMessage, setLoadMessage] = useState<string | null>("Tina is reopening this saved packet...");
  const [downloadState, setDownloadState] = useState<DownloadKind | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<TinaPacketReviewDecision>("unreviewed");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [reviewSaveState, setReviewSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [reviewSaveMessage, setReviewSaveMessage] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<"idle" | "restoring" | "error">("idle");
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPacket() {
      try {
        setLoadState("loading");
        setLoadMessage("Tina is reopening this saved packet...");
        const headers = await sentinelAuthHeaders();
        const [packetRes, workspaceRes] = await Promise.all([
          fetch(`/api/tina/packets/${encodeURIComponent(fingerprint)}`, {
            method: "GET",
            headers,
          }),
          fetch("/api/tina/workspace", {
            method: "GET",
            headers,
          }),
        ]);

        if (!packetRes.ok) throw new Error("saved packet load failed");
        if (!workspaceRes.ok) throw new Error("live workspace load failed");

        const packetPayload = (await packetRes.json()) as { packet?: unknown };
        const workspacePayload = (await workspaceRes.json()) as { draft?: TinaWorkspaceDraft };
        const parsedPacket = parseTinaStoredPacketVersion(packetPayload.packet);
        const parsedLiveDraft = workspacePayload.draft
          ? parseTinaWorkspaceDraft(JSON.stringify(workspacePayload.draft))
          : createDefaultTinaWorkspaceDraft();

        if (!parsedPacket) throw new Error("saved packet parse failed");
        if (cancelled) return;

        setSavedPacket(parsedPacket);
        setLiveDraft(parsedLiveDraft);
        setLoadState("ready");
        setLoadMessage(
          `Tina reopened ${parsedPacket.packetId} (${parsedPacket.packetVersion}) in read-only mode.`
        );
      } catch {
        if (cancelled) return;
        setLoadState("error");
        setLoadMessage(
          "Tina could not reopen that saved packet right now. It may have been removed or your session needs a refresh."
        );
      }
    }

    void loadPacket();

    return () => {
      cancelled = true;
    };
  }, [fingerprint]);

  const savedManifest = useMemo(
    () => (savedPacket ? buildTinaArtifactManifest(savedPacket.draft) : null),
    [savedPacket]
  );
  const comparison = useMemo(
    () =>
      savedPacket && liveDraft ? buildTinaPacketComparison(savedPacket.draft, liveDraft) : null,
    [liveDraft, savedPacket]
  );

  useEffect(() => {
    if (!savedPacket) return;
    setReviewDecision(savedPacket.review.decision);
    setReviewerName(savedPacket.review.reviewerName);
    setReviewerNote(savedPacket.review.reviewerNote);
  }, [savedPacket]);

  async function downloadSavedPacket(kind: DownloadKind) {
    if (!savedPacket) return;

    try {
      setDownloadState(kind);
      setDownloadMessage(`Tina is downloading the saved ${DOWNLOAD_LABELS[kind]}...`);
      const headers = await sentinelAuthHeaders();
      const res = await fetch(DOWNLOAD_ROUTES[kind], {
        method: "POST",
        headers,
        body: JSON.stringify({ packetFingerprint: savedPacket.fingerprint }),
      });

      if (!res.ok) {
        const maybeJson = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || "download failed");
      }

      if (kind === "official_pdf") {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const fileNameMatch = disposition.match(/filename="([^"]+)"/);
        const fileName = fileNameMatch?.[1] || "tina-saved-packet.pdf";
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const payload = (await res.json()) as {
          fileName?: string;
          mimeType?: string;
          contents?: string;
        };

        if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
          throw new Error("missing saved packet export");
        }

        const blob = new Blob([payload.contents], { type: payload.mimeType });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = payload.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      }

      setDownloadMessage(`Tina downloaded the saved ${DOWNLOAD_LABELS[kind]}.`);
      setDownloadState(null);
    } catch (error) {
      setDownloadState(null);
      setDownloadMessage(
        error instanceof Error
          ? error.message
          : `Tina could not download the saved ${DOWNLOAD_LABELS[kind]} yet.`
      );
    }
  }

  async function savePacketReview() {
    if (!savedPacket) return;

    try {
      setReviewSaveState("saving");
      setReviewSaveMessage("Tina is saving the packet review trail...");
      const headers = await sentinelAuthHeaders();
      const res = await fetch(`/api/tina/packets/${encodeURIComponent(savedPacket.fingerprint)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          review: {
            decision: reviewDecision,
            reviewerName,
            reviewerNote,
          },
        }),
      });

      const payload = (await res.json().catch(() => null)) as { packet?: unknown; error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "review save failed");
      }

      const parsedPacket = parseTinaStoredPacketVersion(payload?.packet);
      if (!parsedPacket) throw new Error("saved packet parse failed");

      setSavedPacket(parsedPacket);
      setReviewSaveState("idle");
      setReviewSaveMessage("Tina saved the packet review trail.");
    } catch (error) {
      setReviewSaveState("error");
      setReviewSaveMessage(
        error instanceof Error ? error.message : "Tina could not save the packet review yet."
      );
    }
  }

  async function restoreSavedPacketToWorkspace() {
    if (!savedPacket) return;

    try {
      setRestoreState("restoring");
      setRestoreMessage("Tina is loading this exact saved packet back into today's workspace...");
      const headers = await sentinelAuthHeaders();
      const res = await fetch(
        `/api/tina/packets/${encodeURIComponent(savedPacket.fingerprint)}/restore`,
        {
          method: "POST",
          headers,
        }
      );

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "restore failed");
      }

      window.location.assign(`/tina?restoredPacket=${encodeURIComponent(savedPacket.fingerprint)}`);
    } catch (error) {
      setRestoreState("error");
      setRestoreMessage(
        error instanceof Error
          ? error.message
          : "Tina could not load this saved packet into the live workspace yet."
      );
    }
  }

  if (loadState === "loading") {
    return (
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadMessage}
        </CardContent>
      </Card>
    );
  }

  if (loadState === "error" || !savedPacket || !savedManifest) {
    return (
      <Card className="border-rose-300/18 bg-rose-300/8 backdrop-blur-2xl">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-medium text-white">Saved packet unavailable</p>
          <p className="text-sm leading-6 text-rose-100">{loadMessage}</p>
          <Button asChild variant="outline" className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8">
            <Link href="/tina">
              <ArrowLeft className="h-4 w-4" />
              Back to Tina workspace
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Read-Only Packet Review
              </p>
              <CardTitle className="mt-2 text-2xl text-white">
                {savedPacket.packetId} / {savedPacket.packetVersion}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                exact saved packet
              </span>
              <Button asChild variant="outline" className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8">
                <Link href="/tina">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Tina
                </Link>
              </Button>
            </div>
          </div>
          <p className="text-sm leading-6 text-zinc-300">
            Tina is showing the exact packet snapshot saved on {formatSavedAt(savedPacket.lastStoredAt)}.
            This page is read-only, so you can inspect an older packet without changing today&apos;s workspace.
          </p>
          {loadMessage ? <p className="text-sm text-zinc-400">{loadMessage}</p> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Ready files then
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{savedManifest.readyCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Waiting files then
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{savedManifest.waitingCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Blocked files then
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{savedManifest.blockedCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                Fingerprint {savedPacket.fingerprint.slice(0, 12)}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                Saved {formatSavedAt(savedPacket.lastStoredAt)}
              </span>
              {savedPacket.draft.finalSignoff.confirmedAt ? (
                <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-100">
                  Confirmed {formatSavedAt(savedPacket.draft.finalSignoff.confirmedAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm font-medium text-white">{savedManifest.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{savedManifest.nextStep}</p>
          </div>

          {comparison ? (
            <div className={cn("rounded-2xl border px-4 py-4", COMPARISON_STYLES[comparison.tone])}>
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <ShieldCheck className="h-4 w-4" />
                Saved vs live packet
              </div>
              <p className="mt-3 text-sm leading-6">{comparison.summary}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-300">{comparison.nextStep}</p>
              {comparison.items.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {comparison.items.map((item) => (
                    <div
                      key={`${savedPacket.fingerprint}-${item.id}`}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-200">{item.summary}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck className="h-4 w-4" />
              Reviewer trail for this saved packet
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              This note belongs to this exact saved packet revision. It does not change the live
              workspace.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  "unreviewed",
                  "reference_only",
                  "needs_follow_up",
                  "approved_for_handoff",
                ] as TinaPacketReviewDecision[]
              ).map((decision) => (
                <Button
                  key={decision}
                  type="button"
                  variant="outline"
                  className={cn(
                    "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8",
                    reviewDecision === decision && REVIEW_DECISION_STYLES[decision]
                  )}
                  onClick={() => setReviewDecision(decision)}
                >
                  {REVIEW_DECISION_LABELS[decision]}
                </Button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white" htmlFor="reviewer-name">
                  Reviewer name
                </label>
                <Input
                  id="reviewer-name"
                  value={reviewerName}
                  onChange={(event) => setReviewerName(event.target.value)}
                  placeholder="Who reviewed this saved packet?"
                  className="border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                <p className="font-medium text-white">Current saved review</p>
                <p className="mt-2">{REVIEW_DECISION_LABELS[savedPacket.review.decision]}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {savedPacket.review.reviewedAt
                    ? `Last saved ${formatSavedAt(savedPacket.review.reviewedAt)}`
                    : "No review saved for this packet yet."}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="reviewer-note">
                Reviewer note
              </label>
              <Textarea
                id="reviewer-note"
                value={reviewerNote}
                onChange={(event) => setReviewerNote(event.target.value)}
                placeholder="What should Tina or the reviewer remember about this exact saved packet?"
                className="min-h-32 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
                onClick={() => void savePacketReview()}
                disabled={reviewSaveState === "saving"}
              >
                {reviewSaveState === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save packet review
              </Button>
              {reviewSaveMessage ? (
                <p
                  className={cn(
                    "text-sm",
                    reviewSaveState === "error" ? "text-rose-200" : "text-zinc-300"
                  )}
                >
                  {reviewSaveMessage}
                </p>
              ) : null}
            </div>
            {savedPacket.review.events.length > 0 ? (
              <div className="mt-4 space-y-3">
                {savedPacket.review.events.map((event, index) => (
                  <div
                    key={`${savedPacket.fingerprint}-review-${event.at}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                        {REVIEW_DECISION_LABELS[event.decision]}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                        {formatSavedAt(event.at)}
                      </span>
                      {event.reviewerName ? (
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                          {event.reviewerName}
                        </span>
                      ) : null}
                    </div>
                    {event.reviewerNote ? (
                      <p className="mt-3 text-sm leading-6 text-zinc-300">{event.reviewerNote}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
              onClick={() => void restoreSavedPacketToWorkspace()}
              disabled={restoreState === "restoring"}
            >
              {restoreState === "restoring" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Use as live workspace
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadSavedPacket("bundle")}
              disabled={downloadState !== null}
            >
              {downloadState === "bundle" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download saved bundle
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadSavedPacket("review_packet")}
              disabled={downloadState !== null}
            >
              {downloadState === "review_packet" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Download review packet
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadSavedPacket("official_pdf")}
              disabled={downloadState !== null}
            >
              {downloadState === "official_pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download official-form PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadSavedPacket("handoff")}
              disabled={downloadState !== null}
            >
              {downloadState === "handoff" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download handoff file
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadSavedPacket("cpa_notes")}
              disabled={downloadState !== null}
            >
              {downloadState === "cpa_notes" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Download CPA notes
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            >
              <Link href="/tina/packets">
                <FolderOpen className="h-4 w-4" />
                All saved packets
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            >
              <Link href="/tina">
                <ExternalLink className="h-4 w-4" />
                Open live workspace
              </Link>
            </Button>
          </div>
          {downloadMessage ? <p className="text-sm text-zinc-300">{downloadMessage}</p> : null}
          {restoreMessage ? (
            <p className={cn("text-sm", restoreState === "error" ? "text-rose-200" : "text-zinc-300")}>
              {restoreMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardHeader>
          <CardTitle className="text-white">What this saved packet contained</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {savedManifest.items.map((item) => (
            <div
              key={`${savedPacket.fingerprint}-${item.id}`}
              className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                    {item.format} • {item.fileName}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      DELIVERY_STYLES[item.delivery]
                    )}
                  >
                    {DELIVERY_LABELS[item.delivery]}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
                    {item.status}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{item.summary}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{item.nextStep}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
