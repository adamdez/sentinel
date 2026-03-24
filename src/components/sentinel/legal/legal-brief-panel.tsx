"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Gavel,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";

// ── Types ────────────────────────────────────────────────────────────────────

interface RecordedDocument {
  id: string;
  property_id: string;
  lead_id: string | null;
  document_type: string;
  instrument_number: string | null;
  recording_date: string | null;
  document_date: string | null;
  grantor: string | null;
  grantee: string | null;
  amount: number | null;
  lender_name: string | null;
  status: string;
  case_number: string | null;
  court_name: string | null;
  case_type: string | null;
  attorney_name: string | null;
  contact_person: string | null;
  next_hearing_date: string | null;
  event_description: string | null;
  source: string;
  source_url: string | null;
  raw_excerpt: string | null;
  created_at: string;
}

interface LegalBriefPanelProps {
  leadId: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  deed_of_trust: { bg: "bg-blue-500/15", text: "text-blue-300", label: "Deed of Trust" },
  assignment: { bg: "bg-blue-500/10", text: "text-blue-300/80", label: "Assignment" },
  substitution: { bg: "bg-blue-500/10", text: "text-blue-300/80", label: "Substitution" },
  deed: { bg: "bg-blue-500/10", text: "text-blue-300/80", label: "Deed" },
  reconveyance: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Reconveyance" },
  release: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Release" },
  lis_pendens: { bg: "bg-red-500/15", text: "text-red-300", label: "Lis Pendens" },
  foreclosure_notice: { bg: "bg-red-500/15", text: "text-red-300", label: "Foreclosure Notice" },
  trustee_sale_notice: { bg: "bg-red-500/15", text: "text-red-300", label: "Trustee Sale" },
  lien: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Lien" },
  mechanic_lien: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Mechanic Lien" },
  tax_lien: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Tax Lien" },
  hud_partial_claim: { bg: "bg-amber-500/15", text: "text-amber-300", label: "HUD Partial Claim" },
  judgment: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Judgment" },
  probate_petition: { bg: "bg-purple-500/15", text: "text-purple-300", label: "Probate" },
  bankruptcy_filing: { bg: "bg-purple-500/15", text: "text-purple-300", label: "Bankruptcy" },
  divorce_filing: { bg: "bg-purple-500/15", text: "text-purple-300", label: "Divorce" },
  court_filing: { bg: "bg-purple-500/10", text: "text-purple-300/80", label: "Court Filing" },
  unknown: { bg: "bg-muted/10", text: "text-muted-foreground", label: "Unknown" },
};

function getDocStyle(type: string) {
  return DOC_TYPE_COLORS[type] ?? DOC_TYPE_COLORS.unknown;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return "";
  return "$" + amount.toLocaleString();
}

function daysFromNow(iso: string): number {
  const d = new Date(iso);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function sourceLabel(source: string): string {
  switch (source) {
    case "spokane_recorder": return "County Recorder";
    case "wa_courts": return "WA Courts";
    case "spokane_liens": return "County Liens";
    default: return source;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function LegalBriefPanel({ leadId }: LegalBriefPanelProps) {
  const [documents, setDocuments] = useState<RecordedDocument[]>([]);
  const [lastSearchedAt, setLastSearchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const loaded = useRef(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await sentinelAuthHeaders(false);
      const res = await fetch(`/api/leads/${leadId}/legal-search`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setLastSearchedAt(data.lastSearchedAt ?? null);
    } catch {
      // Silent fail on initial load
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetchDocuments();
  }, [fetchDocuments]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch(`/api/leads/${leadId}/legal-search`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Search failed");
      }
      const result = await res.json();
      toast.success(
        `Found ${result.documentsFound} documents, ${result.courtCasesFound} court cases`,
      );
      await fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Legal search failed");
    } finally {
      setSearching(false);
    }
  }, [leadId, fetchDocuments]);

  // Split documents into categories
  const courtCases = documents.filter((d) => d.case_number);
  const activeLiens = documents.filter(
    (d) =>
      d.status === "active" &&
      ["lien", "mechanic_lien", "tax_lien", "hud_partial_claim", "deed_of_trust", "judgment"].includes(d.document_type),
  );
  const totalLienAmount = activeLiens.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  // Find next upcoming event
  const upcomingEvents = documents
    .filter((d) => d.next_hearing_date)
    .map((d) => ({ ...d, _days: daysFromNow(d.next_hearing_date!) }))
    .filter((d) => d._days >= 0)
    .sort((a, b) => a._days - b._days);
  const nextEvent = upcomingEvents[0] ?? null;

  if (loading && documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading legal records...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground/60" />
            Legal Brief
          </h2>
          {lastSearchedAt && (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              Last searched {formatDate(lastSearchedAt)}
            </p>
          )}
        </div>
        <button
          onClick={runSearch}
          disabled={searching}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-glass-border hover:bg-muted/10 transition-colors disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Search className="h-3 w-3" />
          )}
          {documents.length === 0 ? "Run Legal Search" : "Refresh"}
        </button>
      </div>

      {/* Empty state */}
      {documents.length === 0 && !searching && (
        <div className="rounded-lg border border-dashed border-glass-border p-8 text-center">
          <Scale className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/60">No legal records found yet</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            Click &quot;Run Legal Search&quot; to crawl county recorder and court records
          </p>
        </div>
      )}

      {/* Searching state */}
      {searching && (
        <div className="rounded-lg border border-glass-border bg-panel/50 p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Searching county records...</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Crawling Spokane County Recorder, WA Courts, and County Liens
          </p>
        </div>
      )}

      {documents.length > 0 && (
        <>
          {/* Next Upcoming Event */}
          {nextEvent && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-500/20 p-2 mt-0.5">
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-amber-200">
                      Next Event
                    </span>
                    <span className="text-xs font-mono text-amber-300/80">
                      in {nextEvent._days} day{nextEvent._days !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 mt-0.5">
                    {formatDate(nextEvent.next_hearing_date)} —{" "}
                    {getDocStyle(nextEvent.document_type).label}
                    {nextEvent.case_number && (
                      <span className="text-muted-foreground/60">
                        {" "}· Case {nextEvent.case_number}
                      </span>
                    )}
                  </p>
                  {nextEvent.event_description && (
                    <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">
                      {nextEvent.event_description}
                    </p>
                  )}
                  {nextEvent.attorney_name && (
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      Attorney: {nextEvent.attorney_name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-glass-border bg-panel/50 p-3">
              <p className="text-[10px] uppercase text-muted-foreground/50 tracking-wider">
                Total Records
              </p>
              <p className="text-lg font-semibold font-mono mt-0.5">{documents.length}</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-panel/50 p-3">
              <p className="text-[10px] uppercase text-muted-foreground/50 tracking-wider">
                Active Liens
              </p>
              <p className="text-lg font-semibold font-mono text-amber-300 mt-0.5">
                {activeLiens.length}
              </p>
            </div>
            <div className="rounded-lg border border-glass-border bg-panel/50 p-3">
              <p className="text-[10px] uppercase text-muted-foreground/50 tracking-wider">
                Total Encumbrance
              </p>
              <p className="text-lg font-semibold font-mono text-amber-300 mt-0.5">
                {totalLienAmount > 0 ? formatCurrency(totalLienAmount) : "—"}
              </p>
            </div>
          </div>

          {/* Event Timeline */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Event Timeline
            </h3>
            <div className="space-y-1">
              {documents.map((doc) => {
                const style = getDocStyle(doc.document_type);
                const isExpanded = expandedId === doc.id;
                const isReleased = ["released", "dismissed"].includes(doc.status);

                return (
                  <div key={doc.id} className="group">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                      className={`w-full text-left rounded-md px-3 py-2.5 border border-transparent hover:border-glass-border hover:bg-muted/5 transition-colors ${
                        isReleased ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Date column */}
                        <div className="w-24 shrink-0">
                          <span className="text-xs font-mono text-muted-foreground/60">
                            {formatDate(doc.recording_date)}
                          </span>
                        </div>

                        {/* Type badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text} shrink-0`}
                        >
                          {style.label}
                        </span>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs ${isReleased ? "line-through text-muted-foreground/40" : "text-foreground/80"}`}>
                            {doc.grantor && doc.grantee
                              ? `${doc.grantor} → ${doc.grantee}`
                              : doc.event_description || doc.case_type || "—"}
                          </span>
                        </div>

                        {/* Amount */}
                        {doc.amount != null && doc.amount > 0 && (
                          <span className="text-xs font-mono text-muted-foreground/60 shrink-0">
                            {formatCurrency(doc.amount)}
                          </span>
                        )}

                        {/* Expand icon */}
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="ml-[6.5rem] pl-4 border-l-2 border-glass-border pb-4 mb-2 space-y-2.5 pt-1">
                        {doc.instrument_number && (
                          <DetailRow label="Instrument #" value={doc.instrument_number} />
                        )}
                        {doc.lender_name && <DetailRow label="Lender" value={doc.lender_name} />}
                        {doc.case_number && <DetailRow label="Case #" value={doc.case_number} />}
                        {doc.court_name && <DetailRow label="Court" value={doc.court_name} />}
                        {doc.attorney_name && (
                          <DetailRow label="Attorney" value={doc.attorney_name} />
                        )}
                        {doc.contact_person && (
                          <DetailRow label="Contact" value={doc.contact_person} />
                        )}
                        {doc.next_hearing_date && (
                          <DetailRow
                            label="Next Hearing"
                            value={formatDate(doc.next_hearing_date)}
                          />
                        )}
                        <DetailRow label="Status" value={doc.status} />
                        <DetailRow label="Source" value={sourceLabel(doc.source)} />
                        {doc.source_url && (
                          <a
                            href={doc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-primary-300/70 hover:text-primary-300 mt-2"
                          >
                            <ExternalLink className="h-4 w-4" /> View source
                          </a>
                        )}
                        {doc.raw_excerpt && (
                          <p className="text-xs text-muted-foreground/40 mt-3 line-clamp-4 font-mono leading-relaxed">
                            {doc.raw_excerpt}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Court Cases section */}
          {courtCases.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 flex items-center gap-1.5">
                <Gavel className="h-3.5 w-3.5" />
                Court Cases ({courtCases.length})
              </h3>
              <div className="space-y-2">
                {courtCases.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-glass-border bg-panel/30 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-foreground/80">
                          {c.case_number}
                        </span>
                        {c.case_type && (
                          <span className="ml-2 text-[10px] text-muted-foreground/60">
                            {c.case_type}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          c.status === "pending"
                            ? "bg-amber-500/15 text-amber-300"
                            : c.status === "dismissed"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-muted/10 text-muted-foreground/60"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    {c.court_name && (
                      <p className="text-[11px] text-muted-foreground/50">{c.court_name}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {c.recording_date && (
                        <MiniDetail icon={Calendar} label="Filed" value={formatDate(c.recording_date)} />
                      )}
                      {c.next_hearing_date && (
                        <MiniDetail
                          icon={Clock}
                          label="Next Hearing"
                          value={formatDate(c.next_hearing_date)}
                        />
                      )}
                      {c.attorney_name && (
                        <MiniDetail icon={FileText} label="Attorney" value={c.attorney_name} />
                      )}
                    </div>

                    {c.event_description && (
                      <p className="text-[11px] text-muted-foreground/40 line-clamp-2">
                        {c.event_description}
                      </p>
                    )}

                    {c.source_url && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary-300/60 hover:text-primary-300"
                      >
                        <ExternalLink className="h-2.5 w-2.5" /> Source
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Liens section */}
          {activeLiens.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Active Liens ({activeLiens.length})
              </h3>
              <div className="rounded-lg border border-glass-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-glass-border bg-muted/5">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground/50">Type</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground/50">Holder</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground/50">Amount</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground/50">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLiens.map((lien) => {
                      const style = getDocStyle(lien.document_type);
                      return (
                        <tr key={lien.id} className="border-b border-glass-border/50 last:border-0">
                          <td className="py-2 px-3">
                            <span className={`${style.text}`}>{style.label}</span>
                          </td>
                          <td className="py-2 px-3 text-foreground/70">
                            {lien.lender_name || lien.grantee || "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-foreground/70">
                            {lien.amount ? formatCurrency(lien.amount) : "—"}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground/50">
                            {formatDate(lien.recording_date)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totalLienAmount > 0 && (
                    <tfoot>
                      <tr className="border-t border-glass-border bg-muted/5">
                        <td colSpan={2} className="py-2 px-3 font-medium text-muted-foreground/50">
                          Total
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-amber-300">
                          {formatCurrency(totalLienAmount)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Helper sub-components ────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground/40 w-28 shrink-0">{label}</span>
      <span className="text-foreground/70">{value}</span>
    </div>
  );
}

function MiniDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
      <Icon className="h-3 w-3" />
      <span>{label}:</span>
      <span className="text-foreground/60">{value}</span>
    </div>
  );
}
