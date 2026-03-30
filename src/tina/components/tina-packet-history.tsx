"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderOpen, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import {
  filterTinaPacketHistory,
  summarizeTinaPacketHistory,
  type TinaPacketHistoryFilter,
} from "@/tina/lib/packet-history";
import type {
  TinaPacketReviewDecision,
  TinaPacketVersionOrigin,
  TinaStoredPacketVersionSummary,
} from "@/tina/lib/packet-versions";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function formatSavedAt(value: string | null): string {
  if (!value) return "Unknown save time";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

const PACKAGE_LEVEL_LABELS = {
  blocked: "blocked",
  needs_review: "needs review",
  ready_for_cpa: "ready for CPA handoff",
} as const;

const PACKAGE_LEVEL_STYLES = {
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-100",
  needs_review: "border-amber-300/18 bg-amber-300/8 text-amber-100",
  ready_for_cpa: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
} as const;

const ORIGIN_LABELS: Record<TinaPacketVersionOrigin, string> = {
  cpa_packet_export: "CPA notes",
  official_form_export: "official forms",
  official_form_pdf_export: "official-form PDF",
  review_book_export: "handoff packet",
  review_bundle_export: "review bundle",
  review_bundle_package: "bundle package",
  review_packet_html_export: "review packet",
};

const FILTER_OPTIONS: Array<{ id: TinaPacketHistoryFilter; label: string }> = [
  { id: "all", label: "All packets" },
  { id: "unreviewed", label: "Not reviewed" },
  { id: "needs_follow_up", label: "Needs follow-up" },
  { id: "approved_for_handoff", label: "Looks ready" },
  { id: "reference_only", label: "Reference only" },
];

export function TinaPacketHistory() {
  const [packetVersions, setPacketVersions] = useState<TinaStoredPacketVersionSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>("Tina is opening the saved packet shelf...");
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<TinaPacketHistoryFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [restoringFingerprint, setRestoringFingerprint] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [livePacketFingerprint, setLivePacketFingerprint] = useState<string | null>(null);
  const [livePacketLabel, setLivePacketLabel] = useState<string | null>(null);

  async function loadPacketVersions(refresh = false) {
    try {
      if (refresh) {
        setRefreshing(true);
        setMessage("Tina is refreshing the saved packet shelf...");
      } else {
        setLoadState("loading");
        setMessage("Tina is opening the saved packet shelf...");
      }

      const headers = await sentinelAuthHeaders();
      const [packetRes, workspaceRes] = await Promise.all([
        fetch("/api/tina/packets", {
          method: "GET",
          headers,
        }),
        fetch("/api/tina/workspace", {
          method: "GET",
          headers,
        }),
      ]);

      if (!packetRes.ok || !workspaceRes.ok) throw new Error("packet history load failed");

      const payload = (await packetRes.json()) as {
        packetVersions?: TinaStoredPacketVersionSummary[];
      };
      const workspacePayload = (await workspaceRes.json()) as {
        draft?: unknown;
      };

      const nextPacketVersions = Array.isArray(payload.packetVersions) ? payload.packetVersions : [];
      const liveDraft = parseTinaWorkspaceDraft(
        workspacePayload.draft ? JSON.stringify(workspacePayload.draft) : null
      );
      const livePacketIdentity = buildTinaPacketIdentity(liveDraft);

      setPacketVersions(nextPacketVersions);
      setLivePacketFingerprint(livePacketIdentity.fingerprint);
      setLivePacketLabel(`${livePacketIdentity.packetId} / ${livePacketIdentity.packetVersion}`);
      setLoadState("ready");
      setMessage(
        nextPacketVersions.length > 0
          ? "Tina reopened the saved packet shelf."
          : "Tina has not saved a packet revision on the server yet."
      );
    } catch {
      setLoadState("error");
      setMessage(
        "Tina could not open the saved packet shelf right now. Try again in a moment."
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPacketVersions();
  }, []);

  async function restorePacketVersion(fingerprint: string) {
    try {
      setRestoringFingerprint(fingerprint);
      setRestoreMessage("Tina is loading that saved packet back into today's workspace...");
      const headers = await sentinelAuthHeaders();
      const res = await fetch(`/api/tina/packets/${encodeURIComponent(fingerprint)}/restore`, {
        method: "POST",
        headers,
      });

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "restore failed");
      }

      window.location.assign(`/tina?restoredPacket=${encodeURIComponent(fingerprint)}`);
    } catch (error) {
      setRestoringFingerprint(null);
      setRestoreMessage(
        error instanceof Error
          ? error.message
          : "Tina could not load that saved packet into the live workspace yet."
      );
    }
  }

  const summary = useMemo(() => summarizeTinaPacketHistory(packetVersions), [packetVersions]);
  const filteredPackets = useMemo(
    () => filterTinaPacketHistory(packetVersions, { query, reviewFilter }),
    [packetVersions, query, reviewFilter]
  );

  if (loadState === "loading") {
    return (
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          {message}
        </CardContent>
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card className="border-rose-300/18 bg-rose-300/8 backdrop-blur-2xl">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-medium text-white">Saved packet shelf unavailable</p>
          <p className="text-sm leading-6 text-rose-100">{message}</p>
          <Button
            type="button"
            className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
            onClick={() => void loadPacketVersions(true)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Try again
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
                Saved Packet Shelf
              </p>
              <CardTitle className="mt-2 text-2xl text-white">
                {summary.totalCount === 0
                  ? "No saved packet revisions yet"
                  : `${summary.totalCount} saved packet revision${summary.totalCount === 1 ? "" : "s"}`}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                onClick={() => void loadPacketVersions(true)}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh shelf
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
          </div>
          <p className="text-sm leading-6 text-zinc-300">{message}</p>
          {livePacketLabel ? (
            <p className="text-sm leading-6 text-zinc-400">
              Today&apos;s live workspace packet:{" "}
              <span className="font-mono text-zinc-200">{livePacketLabel}</span>
            </p>
          ) : null}
          {restoreMessage ? (
            <p className="text-sm text-zinc-300">{restoreMessage}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Total saved
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{summary.totalCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Reviewed
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{summary.reviewedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Looks ready
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{summary.approvedCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Needs follow-up
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{summary.followUpCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by business, packet ID, reviewer, or summary"
                className="border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
              />
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    variant="outline"
                    className={cn(
                      "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8",
                      reviewFilter === option.id &&
                        "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                    )}
                    onClick={() => setReviewFilter(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardHeader>
          <CardTitle className="text-white">Saved packet revisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredPackets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-5 text-sm leading-6 text-zinc-300">
              {packetVersions.length === 0
                ? "Tina has not pinned a server packet yet. The first export will put one on this shelf."
                : "Tina could not find a saved packet that matches this search yet. Try a simpler search or another review filter."}
            </div>
          ) : (
            filteredPackets.map((packet) => {
              const matchesLiveWorkspace = packet.fingerprint === livePacketFingerprint;

              return (
                <div
                  key={packet.fingerprint}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {packet.packetId} / {packet.packetVersion}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                        {packet.businessName} / {packet.taxYear}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {matchesLiveWorkspace ? (
                        <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                          current live packet
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          REVIEW_DECISION_STYLES[packet.reviewDecision]
                        )}
                      >
                        {REVIEW_DECISION_LABELS[packet.reviewDecision]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          PACKAGE_LEVEL_STYLES[packet.packageLevel]
                        )}
                      >
                        {PACKAGE_LEVEL_LABELS[packet.packageLevel]}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-zinc-200">{packet.packageSummary}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                      Saved {formatSavedAt(packet.lastStoredAt)}
                    </span>
                    {packet.reviewedAt ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                        Reviewed {formatSavedAt(packet.reviewedAt)}
                      </span>
                    ) : null}
                    {packet.reviewerName ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                        {packet.reviewerName}
                      </span>
                    ) : null}
                    {packet.confirmedAt ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-100">
                        Final signoff {formatSavedAt(packet.confirmedAt)}
                      </span>
                    ) : null}
                  </div>

                  {packet.origins.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {packet.origins.map((origin) => (
                        <span
                          key={`${packet.fingerprint}-${origin}`}
                          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300"
                        >
                          {ORIGIN_LABELS[origin]}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="bg-emerald-300 text-zinc-950 hover:bg-emerald-200"
                      onClick={() => void restorePacketVersion(packet.fingerprint)}
                      disabled={restoringFingerprint !== null}
                    >
                      {restoringFingerprint === packet.fingerprint ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Use as live workspace
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                    >
                      <Link href={`/tina/packets/${packet.fingerprint}`}>
                        <FolderOpen className="h-4 w-4" />
                        Open exact review page
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                    >
                      <Link href="/tina">
                        <ShieldCheck className="h-4 w-4" />
                        Back to live workspace
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
