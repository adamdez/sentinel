import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getPropertyDetailByAddress } from "@/lib/attom";
import { fanOutAgents, formatFindingsForGrok, buildDeepSkipResult } from "@/lib/openclaw-client";
import type { AgentResult, AgentMeta, AgentFinding, DeepSkipResult, PropertyPhoto } from "@/lib/openclaw-client";
import { buildAgentPlan, buildPropertyContext } from "@/lib/openclaw-orchestrator";

/**
 * POST /api/prospects/deep-crawl
 *
 * Deep Crawl: Distress Intelligence Research
 *
 * Performs intensive research across PropertyRadar, ATTOM, and Grok AI
 * (with web search) to produce a full intelligence dossier on a property's
 * distress signals. Then backfills actual dates/amounts into distress_events
 * so tooltips improve.
 *
 * Body: { property_id: string, lead_id: string }
 */

const PR_API_BASE = "https://api.propertyradar.com/v1/properties";
const GROK_ENDPOINT = "https://api.x.ai/v1/responses";
const GROK_MODEL = "grok-4-1-fast-reasoning";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180; // allow up to 3 min for deep research

// ── Types ──────────────────────────────────────────────────────────

interface SignalDetail {
  type: string;
  filingDate: string | null;
  amount: number | null;
  stage: string | null;
  auctionDate: string | null;
  lender: string | null;
  installmentsBehind: number | null;
  source: string;
}

interface FinancialDetail {
  avm: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  loanBalance: number | null;
  taxAssessed: number | null;
  taxAmount: number | null;
}

interface OwnerDetail {
  name: string;
  age: number | null;
  ownershipYears: number | null;
  lastTransferDate: string | null;
  lastTransferValue: number | null;
  lastTransferType: string | null;
  absentee: boolean;
  deceased: boolean;
  freeClear: boolean;
  mailingAddress: string | null;
}

interface CallHistoryItem {
  date: string;
  disposition: string;
  notes: string | null;
}

interface DeepCrawlData {
  signals: SignalDetail[];
  financial: FinancialDetail;
  owner: OwnerDetail;
  callHistory: CallHistoryItem[];
}

export interface DeepCrawlResult {
  crawledAt: string;
  signals: SignalDetail[];
  financial: FinancialDetail;
  owner: OwnerDetail;
  aiDossier: {
    summary: string;
    urgencyLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    urgencyReason: string;
    signalAnalysis: { headline: string; detail: string; daysUntilCritical: number | null; actionableInsight: string }[];
    ownerProfile: string;
    financialAnalysis: string;
    suggestedApproach: string;
    redFlags: string[];
    talkingPoints: string[];
    webFindings: { source: string; finding: string }[];
    estimatedMAO: { low: number; high: number; basis: string } | null;
  };
  sources: string[];
  grokSuccess?: boolean;
  // Phase 2.5 — OpenClaw agent findings
  agentFindings?: AgentFinding[];
  agentMeta?: AgentMeta;
  // Phase 2.6 — Property photos from real sources
  photos?: PropertyPhoto[];
  // Phase 2.75 — Deep Skip Report (people intelligence)
  deepSkip?: DeepSkipResult;
}

// ── Helpers ─────────────────────────────────────────────────────────

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

// ── Main Handler ────────────────────────────────────────────────────

// ── SSE streaming helpers ──────────────────────────────────────────

type SSEController = ReadableStreamDefaultController<Uint8Array>;

function sseEmit(controller: SSEController, encoder: TextEncoder, event: Record<string, unknown>) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    // Stream may be closed
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // ── Pre-flight: parse body and validate ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { property_id, lead_id, force } = body;

  if (!property_id) {
    return NextResponse.json({ error: "property_id is required" }, { status: 400 });
  }

  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => sb.from(name) as any;

  // ── Fetch property ──
  const { data: property, error: propErr } = await tbl("properties")
    .select("*")
    .eq("id", property_id)
    .single();

  if (propErr || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (ownerFlags.pr_raw ?? {}) as Record<string, any>;
  const radarId = ownerFlags.radar_id as string | undefined;

  // ── Check for cached results (7-day API-side cache) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cached = ownerFlags.deep_crawl as any;
  const cachedTime = cached?.crawledAt ?? cached?.crawled_at;
  const hasRealAI = cached?.grokSuccess === true
    || (cached?.aiDossier?.webFindings?.length > 0)
    || (cached?.ai_dossier?.webFindings?.length > 0);
  if (!force && cachedTime && hasRealAI) {
    const ageMs = Date.now() - new Date(cachedTime).getTime();
    if (ageMs < 7 * 24 * 60 * 60 * 1000) {
      console.log(`[DeepCrawl] Returning cached results (${Math.round(ageMs / 3600000)}h old)`);
      return NextResponse.json({ ...cached, fromCache: true });
    }
  }

  // ── Stream the deep crawl as SSE events ──
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: Record<string, unknown>) => sseEmit(controller, encoder, event);

      // Run the entire crawl pipeline inside the stream
      (async () => {
        try {
          const sources: string[] = [];

          // ══════════════════════════════════════════════════════════════════
          // PHASE 1 — Data Gathering (parallel)
          // ══════════════════════════════════════════════════════════════════

          emit({ phase: "data_gathering", status: "started", detail: "Loading PropertyRadar + ATTOM data..." });

          const [prDetail, attomDetail, distressRows, callRows] = await Promise.all([
            fetchPropertyRadarDetail(radarId, prRaw, ownerFlags),
            fetchAttomDetail(property),
            tbl("distress_events")
              .select("*")
              .eq("property_id", property_id)
              .order("created_at", { ascending: false }),
            tbl("calls_log")
              .select("started_at, disposition, ai_note_summary, notes")
              .eq("property_id", property_id)
              .order("started_at", { ascending: false })
              .limit(5),
          ]);

          if (prDetail) sources.push("PropertyRadar");
          if (attomDetail) sources.push("ATTOM");

          const distressEvents = distressRows?.data ?? [];
          const callLogs = callRows?.data ?? [];

          emit({
            phase: "data_gathering", status: "complete",
            detail: `PR=${!!prDetail} ATTOM=${!!attomDetail} events=${distressEvents.length}`,
            elapsed: Date.now() - t0,
          });

          // ══════════════════════════════════════════════════════════════════
          // PHASE 2 — Normalize into structured object
          // ══════════════════════════════════════════════════════════════════

          emit({ phase: "normalization", status: "started", detail: "Normalizing data..." });

          const pr = prDetail ?? prRaw;

          const signals: SignalDetail[] = distressEvents.map((evt: { event_type: string; source: string; raw_data?: Record<string, unknown> }) => {
            const rd = evt.raw_data ?? {};
            return {
              type: evt.event_type,
              filingDate: safeStr(rd.ForeclosureRecDate ?? rd.event_date ?? rd.filing_date ?? rd.recording_date),
              amount: safeNum(rd.DefaultAmount ?? rd.DelinquentAmount ?? rd.delinquent_amount),
              stage: safeStr(rd.ForeclosureStage ?? rd.stage),
              auctionDate: safeStr(rd.FCAuctionDate ?? rd.auction_date),
              lender: safeStr(rd.lenderName ?? rd.lender),
              installmentsBehind: safeNum(rd.NumberDelinquentInstallments),
              source: evt.source ?? "unknown",
            };
          });

          // Enrich signals with PR data
          if (pr) {
            const hasForeclosure = signals.some(s => s.type === "pre_foreclosure" || s.type === "foreclosure");
            if (!hasForeclosure && (pr.ForeclosureRecDate || pr.DefaultAmount)) {
              signals.push({
                type: "pre_foreclosure",
                filingDate: safeStr(pr.ForeclosureRecDate),
                amount: safeNum(pr.DefaultAmount),
                stage: safeStr(pr.ForeclosureStage),
                auctionDate: safeStr(pr.FCAuctionDate),
                lender: safeStr(pr.LenderName),
                installmentsBehind: null,
                source: "propertyradar",
              });
            }

            const taxSignal = signals.find(s => s.type === "tax_lien" || s.type === "tax_delinquency");
            if (taxSignal && !taxSignal.amount && pr.DelinquentAmount) {
              taxSignal.amount = safeNum(pr.DelinquentAmount);
              taxSignal.installmentsBehind = safeNum(pr.NumberDelinquentInstallments);
            }

            const fcSignal = signals.find(s => s.type === "pre_foreclosure" || s.type === "foreclosure");
            if (fcSignal) {
              if (!fcSignal.filingDate && pr.ForeclosureRecDate) fcSignal.filingDate = safeStr(pr.ForeclosureRecDate);
              if (!fcSignal.amount && pr.DefaultAmount) fcSignal.amount = safeNum(pr.DefaultAmount);
              if (!fcSignal.stage && pr.ForeclosureStage) fcSignal.stage = safeStr(pr.ForeclosureStage);
              if (!fcSignal.auctionDate && pr.FCAuctionDate) fcSignal.auctionDate = safeStr(pr.FCAuctionDate);
              if (!fcSignal.lender && pr.LenderName) fcSignal.lender = safeStr(pr.LenderName);
            }
          }

          // Enrich from ATTOM
          if (attomDetail) {
            const attomAssessment = attomDetail.assessment;
            const attomMortgage = attomDetail.mortgage;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const attomForeclosure = (attomDetail as any).foreclosure;

            if (attomForeclosure) {
              const fcSignal = signals.find(s => s.type === "pre_foreclosure" || s.type === "foreclosure");
              if (fcSignal) {
                if (!fcSignal.filingDate && attomForeclosure.recordingDate) fcSignal.filingDate = attomForeclosure.recordingDate;
                if (!fcSignal.amount && attomForeclosure.defaultAmount) fcSignal.amount = safeNum(attomForeclosure.defaultAmount);
                if (!fcSignal.lender && attomMortgage?.lender?.name) fcSignal.lender = attomMortgage.lender.name;
              }
            }

            if (attomAssessment?.tax) {
              const taxSignal = signals.find(s => s.type === "tax_lien" || s.type === "tax_delinquency");
              if (taxSignal && !taxSignal.amount) {
                taxSignal.amount = safeNum(attomAssessment.tax.taxAmt);
              }
            }
          }

          const financial: FinancialDetail = {
            avm: safeNum(pr?.AVM ?? pr?.avm ?? attomDetail?.avm?.amount?.value),
            equityPercent: safeNum(pr?.EquityPercent ?? property.equity_percent),
            availableEquity: safeNum(pr?.AvailableEquity),
            loanBalance: safeNum(pr?.TotalLoanBalance ?? attomDetail?.mortgage?.amount?.firstMortgageAmount),
            taxAssessed: safeNum(attomDetail?.assessment?.assessed?.assdTtlValue ?? pr?.TaxAssessedValue),
            taxAmount: safeNum(attomDetail?.assessment?.tax?.taxAmt ?? pr?.TaxAmount),
          };

          const owner: OwnerDetail = {
            name: property.owner_name ?? "Unknown",
            age: safeNum(pr?.OwnerAge),
            ownershipYears: safeNum(pr?.OwnershipLength ?? property.ownership_years),
            lastTransferDate: safeStr(pr?.LastTransferRecDate),
            lastTransferValue: safeNum(pr?.LastTransferValue),
            lastTransferType: safeStr(pr?.LastTransferType),
            absentee: !!property.owner_flags?.absentee || !!pr?.Absentee,
            deceased: !!pr?.OwnerDeceased,
            freeClear: !!property.is_free_clear || (financial.loanBalance === 0),
            mailingAddress: safeStr(pr?.MailAddress ? `${pr.MailAddress}, ${pr.MailCity ?? ""} ${pr.MailState ?? ""} ${pr.MailZip ?? ""}`.trim() : null),
          };

          const callHistory: CallHistoryItem[] = (callLogs ?? []).map((c: { started_at: string; disposition: string; ai_note_summary: string | null; notes: string | null }) => ({
            date: c.started_at,
            disposition: c.disposition ?? "unknown",
            notes: c.ai_note_summary ?? c.notes ?? null,
          }));

          const crawlData: DeepCrawlData = { signals, financial, owner, callHistory };

          emit({ phase: "normalization", status: "complete", detail: `${signals.length} signals normalized`, elapsed: Date.now() - t0 });

          // ══════════════════════════════════════════════════════════════════
          // PHASE 2.5 — OpenClaw Agent Fan-Out (parallel research)
          // ══════════════════════════════════════════════════════════════════

          let allAgentFindings: AgentFinding[] = [];
          let agentMeta: AgentMeta | undefined;
          let agentFindingsText = "";
          let agentResults: AgentResult[] = [];

          const openClawKey = process.env.OPENCLAW_API_KEY;
          if (openClawKey) {
            try {
              const signalTypes = signals.map(s => s.type);
              const propCtx = buildPropertyContext(property, signalTypes, ownerFlags);
              const plan = buildAgentPlan(propCtx);

              const agentNames = plan.tasks.map(t => t.agentId.replace(/_/g, " ")).join(", ");
              emit({
                phase: "agents", status: "started",
                detail: `Running ${plan.tasks.length} agents: ${agentNames}`,
                agents: plan.tasks.map(t => t.agentId),
              });

              console.log(`[DeepCrawl] Phase 2.5 — ${plan.tasks.length} agents: ${plan.tasks.map(t => t.agentId).join(", ")}`);
              console.log(`[DeepCrawl] Est. cost: $${plan.estimatedCost.toFixed(4)}`);

              const fanResult = await fanOutAgents(plan.tasks);
              agentResults = fanResult.results;
              agentMeta = fanResult.meta;

              allAgentFindings = agentResults.flatMap((r: AgentResult) => r.findings);
              sources.push(`OpenClaw (${fanResult.meta.agentsSucceeded.length}/${fanResult.meta.agentsRun.length} agents)`);
              agentFindingsText = formatFindingsForGrok(agentResults);

              emit({
                phase: "agents", status: "complete",
                detail: `${allAgentFindings.length} findings from ${fanResult.meta.agentsSucceeded.length} agents`,
                elapsed: Date.now() - t0,
                succeeded: fanResult.meta.agentsSucceeded,
                failed: fanResult.meta.agentsFailed,
              });

              if (fanResult.meta.agentsFailed.length > 0) {
                console.warn(`[DeepCrawl] Failed agents: ${fanResult.meta.agentsFailed.join(", ")}`);
              }
            } catch (err) {
              console.error("[DeepCrawl] OpenClaw fan-out error (non-fatal):", err);
              emit({ phase: "agents", status: "error", detail: "Agent research failed (continuing)" });
            }
          }

          // ══════════════════════════════════════════════════════════════════
          // PHASE 2.6 — Google Street View photos
          // ══════════════════════════════════════════════════════════════════

          const photos: PropertyPhoto[] = [];
          const googleKey = process.env.GOOGLE_STREET_VIEW_KEY;
          const lat = property.lat != null ? Number(property.lat) : (pr?.Latitude ? Number(pr.Latitude) : null);
          const lng = property.lng != null ? Number(property.lng) : (pr?.Longitude ? Number(pr.Longitude) : null);

          // Check if we already have street-level photos
          const existingPhotos: string[] = [];
          if (Array.isArray(prRaw.Photos)) existingPhotos.push(...prRaw.Photos.filter((u: unknown) => typeof u === "string"));
          if (Array.isArray(prRaw.photos)) existingPhotos.push(...prRaw.photos.filter((u: unknown) => typeof u === "string"));
          if (typeof prRaw.PropertyImageUrl === "string" && prRaw.PropertyImageUrl) existingPhotos.push(prRaw.PropertyImageUrl);

          if (googleKey && lat && lng && existingPhotos.length === 0) {
            emit({ phase: "photos", status: "started", detail: "Fetching Google Street View..." });
            try {
              // Check metadata first to see if coverage exists
              const metaRes = await fetch(
                `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${googleKey}`
              );
              const meta = await metaRes.json();

              if (meta.status === "OK") {
                // Street View coverage exists — build the URL (don't download the image, just store the URL)
                const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&key=${googleKey}`;
                photos.push({
                  url: streetViewUrl,
                  source: "google_street_view",
                  capturedAt: new Date().toISOString(),
                });
                sources.push("Google Street View");
                emit({ phase: "photos", status: "complete", detail: "Street View photo captured", elapsed: Date.now() - t0 });
              } else {
                emit({ phase: "photos", status: "complete", detail: "No Street View coverage at this location" });
              }
            } catch (err) {
              console.warn("[DeepCrawl] Street View metadata check failed:", err);
              emit({ phase: "photos", status: "error", detail: "Street View check failed (continuing)" });
            }
          }

          // ══════════════════════════════════════════════════════════════════
          // PHASE 2.75 — Post-Processing (Deep Skip Report + contact merge)
          // ══════════════════════════════════════════════════════════════════

          let deepSkipResult: DeepSkipResult | undefined;
          const updatedOwnerFlags = { ...ownerFlags };

          if (agentResults.length > 0 && agentMeta) {
            emit({ phase: "post_processing", status: "started", detail: "Building Deep Skip report, merging contacts..." });

            // Extract known phones/emails for dedup
            const existingPhones = Array.isArray(ownerFlags.all_phones)
              ? (ownerFlags.all_phones as { number: string }[])
                  .filter(p => typeof p === "object" && "number" in p)
                  .map(p => p.number)
              : [];
            const existingEmails = Array.isArray(ownerFlags.all_emails)
              ? (ownerFlags.all_emails as { email: string }[])
                  .filter(e => typeof e === "object" && "email" in e)
                  .map(e => e.email)
              : [];

            deepSkipResult = buildDeepSkipResult(agentResults, existingPhones, existingEmails, agentMeta);

            // Merge new phones into all_phones
            if (deepSkipResult.newPhones.length > 0) {
              const currentPhones = Array.isArray(ownerFlags.all_phones) ? [...ownerFlags.all_phones as unknown[]] : [];
              for (const np of deepSkipResult.newPhones) {
                currentPhones.push({
                  number: np.number,
                  lineType: "unknown",
                  confidence: 60,
                  dnc: false,
                  source: `openclaw_${np.source}`,
                });
              }
              updatedOwnerFlags.all_phones = currentPhones;
              updatedOwnerFlags.phone_count = currentPhones.length;
            }

            // Merge new emails into all_emails
            if (deepSkipResult.newEmails.length > 0) {
              const currentEmails = Array.isArray(ownerFlags.all_emails) ? [...ownerFlags.all_emails as unknown[]] : [];
              for (const ne of deepSkipResult.newEmails) {
                currentEmails.push({
                  email: ne.email,
                  deliverable: true,
                  source: `openclaw_${ne.source}`,
                });
              }
              updatedOwnerFlags.all_emails = currentEmails;
              updatedOwnerFlags.email_count = currentEmails.length;
            }

            emit({
              phase: "post_processing", status: "complete",
              detail: `${deepSkipResult.people.length} people, +${deepSkipResult.newPhones.length} phones, +${deepSkipResult.newEmails.length} emails`,
              elapsed: Date.now() - t0,
            });
          }

          // ══════════════════════════════════════════════════════════════════
          // PHASE 3 — Grok AI synthesis
          // ══════════════════════════════════════════════════════════════════

          const grokApiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let aiDossier: any = null;
          let grokSuccess = false;

          if (grokApiKey) {
            emit({
              phase: "grok_synthesis", status: "started",
              detail: agentFindingsText ? "Grok synthesizing agent findings..." : "Grok researching with web search...",
            });
            try {
              aiDossier = await callGrokDeepCrawl(grokApiKey, property, crawlData, agentFindingsText);
              grokSuccess = true;
              sources.push(agentFindingsText ? "Grok AI (Strategist)" : "Grok AI + Web");
              emit({ phase: "grok_synthesis", status: "complete", detail: "Dossier generated", elapsed: Date.now() - t0 });
            } catch (err) {
              console.error("[DeepCrawl] Grok AI error (non-fatal):", err);
              emit({ phase: "grok_synthesis", status: "error", detail: "AI synthesis failed (using fallback)" });
            }
          }

          if (!aiDossier) {
            aiDossier = buildFallbackDossier(crawlData, property);
          }

          // ══════════════════════════════════════════════════════════════════
          // PHASE 4 — Storage & backfill (parallel)
          // ══════════════════════════════════════════════════════════════════

          emit({ phase: "storage", status: "started", detail: "Saving results..." });

          const result: DeepCrawlResult = {
            crawledAt: new Date().toISOString(),
            signals,
            financial,
            owner,
            aiDossier,
            sources,
            grokSuccess,
            agentFindings: allAgentFindings.length > 0 ? allAgentFindings : undefined,
            agentMeta,
            photos: photos.length > 0 ? photos : undefined,
            deepSkip: deepSkipResult,
          };

          const writes: Promise<unknown>[] = [];

          // 4a. Store in owner_flags.deep_crawl + deep_skip + merged contacts
          writes.push(
            (async () => {
              const flagsToSave = {
                ...updatedOwnerFlags,
                deep_crawl: result,
                ...(deepSkipResult ? { deep_skip: deepSkipResult } : {}),
              };
              const { error: updateErr } = await tbl("properties").update({
                owner_flags: flagsToSave,
                updated_at: new Date().toISOString(),
              }).eq("id", property_id);
              if (updateErr) {
                console.error("[DeepCrawl] Failed to save to owner_flags:", updateErr);
              } else {
                console.log("[DeepCrawl] Saved deep_crawl + deep_skip to owner_flags");
              }
            })(),
          );

          // 4b. Backfill distress_events.raw_data with actual dates/amounts
          for (const evt of distressEvents) {
            const enrichedSignal = signals.find(s => s.type === evt.event_type);
            if (!enrichedSignal) continue;

            const existingRaw = evt.raw_data ?? {};
            const updates: Record<string, unknown> = {};
            let changed = false;

            if (enrichedSignal.filingDate && !existingRaw.ForeclosureRecDate && !existingRaw.filing_date && !existingRaw.event_date) {
              if (evt.event_type === "pre_foreclosure" || evt.event_type === "foreclosure") {
                updates.ForeclosureRecDate = enrichedSignal.filingDate;
              } else {
                updates.filing_date = enrichedSignal.filingDate;
              }
              changed = true;
            }

            if (enrichedSignal.amount != null && !existingRaw.DefaultAmount && !existingRaw.DelinquentAmount && !existingRaw.delinquent_amount) {
              if (evt.event_type === "pre_foreclosure" || evt.event_type === "foreclosure") {
                updates.DefaultAmount = enrichedSignal.amount;
                if (enrichedSignal.stage) updates.ForeclosureStage = enrichedSignal.stage;
                if (enrichedSignal.auctionDate) updates.FCAuctionDate = enrichedSignal.auctionDate;
                if (enrichedSignal.lender) updates.lenderName = enrichedSignal.lender;
              } else if (evt.event_type === "tax_lien" || evt.event_type === "tax_delinquency") {
                updates.DelinquentAmount = enrichedSignal.amount;
                if (enrichedSignal.installmentsBehind != null) updates.NumberDelinquentInstallments = enrichedSignal.installmentsBehind;
              }
              changed = true;
            }

            if (changed) {
              writes.push(
                tbl("distress_events").update({
                  raw_data: { ...existingRaw, ...updates },
                }).eq("id", evt.id),
              );
            }
          }

          // 4c. Create new distress_events from financial_distress agent findings
          if (allAgentFindings.length > 0) {
            const financialFindings = allAgentFindings.filter(
              f => f.structuredData?.eventType && f.structuredData?.filingDate
            );
            for (const f of financialFindings) {
              const sd = f.structuredData!;
              // Dedup: don't create if same event_type already exists
              const existsAlready = distressEvents.some(
                (evt: { event_type: string }) => evt.event_type === sd.eventType
              );
              if (!existsAlready) {
                writes.push(
                  tbl("distress_events").insert({
                    property_id,
                    lead_id: lead_id ?? null,
                    event_type: sd.eventType,
                    source: `openclaw_${f.source}`,
                    raw_data: {
                      finding: f.finding,
                      amount: sd.amount,
                      caseNumber: sd.caseNumber,
                      filing_date: sd.filingDate,
                      url: f.url,
                      confidence: f.confidence,
                    },
                  }),
                );
              }
            }
          }

          // 4d. Audit log
          if (lead_id) {
            writes.push(
              tbl("event_log").insert({
                entity_type: "lead",
                entity_id: lead_id,
                action: "DEEP_CRAWL",
                details: {
                  property_id,
                  sources,
                  signals_enriched: signals.length,
                  urgency_level: aiDossier?.urgencyLevel ?? "UNKNOWN",
                  duration_ms: Date.now() - t0,
                  ...(agentMeta ? {
                    agents_run: agentMeta.agentsRun,
                    agents_succeeded: agentMeta.agentsSucceeded,
                    agents_failed: agentMeta.agentsFailed,
                    agent_findings_count: allAgentFindings.length,
                    agent_duration_ms: agentMeta.totalDurationMs,
                  } : {}),
                  ...(deepSkipResult ? {
                    deep_skip_people: deepSkipResult.people.length,
                    deep_skip_new_phones: deepSkipResult.newPhones.length,
                    deep_skip_new_emails: deepSkipResult.newEmails.length,
                  } : {}),
                  photos_captured: photos.length,
                },
              }),
            );
          }

          await Promise.all(writes);

          emit({ phase: "storage", status: "complete", detail: "Results saved", elapsed: Date.now() - t0 });

          console.log(`[DeepCrawl] Complete in ${Date.now() - t0}ms — ${sources.join(", ")}`);

          // ── Final event: the complete result ──
          emit({ phase: "complete", status: "complete", result, elapsed: Date.now() - t0 });
          controller.close();
        } catch (err) {
          console.error("[DeepCrawl] Stream error:", err);
          const encoder = new TextEncoder();
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ phase: "error", status: "error", detail: err instanceof Error ? err.message : String(err) })}\n\n`)
            );
          } catch { /* stream closed */ }
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ══════════════════════════════════════════════════════════════════════
// PropertyRadar full detail fetch
// ══════════════════════════════════════════════════════════════════════

async function fetchPropertyRadarDetail(
  radarId: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingPrRaw: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ownerFlags: Record<string, any>,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any> | null> {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey || !radarId) return existingPrRaw ?? null;

  // Check if pr_raw is <24h old — use cached
  const prRawUpdated = ownerFlags.pr_raw_updated_at;
  if (prRawUpdated) {
    const ageMs = Date.now() - new Date(prRawUpdated as string).getTime();
    if (ageMs < 24 * 60 * 60 * 1000 && Object.keys(existingPrRaw).length > 5) {
      console.log("[DeepCrawl/PR] Using cached pr_raw (< 24h old)");
      return existingPrRaw;
    }
  }

  try {
    const url = `${PR_API_BASE}/${radarId}?Fields=All&Purchase=1`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[DeepCrawl/PR] API returned ${res.status}`);
      return existingPrRaw ?? null;
    }

    const data = await res.json();
    const detail = data?.properties?.[0] ?? data;
    console.log("[DeepCrawl/PR] Fetched full detail, keys:", Object.keys(detail).length);
    return detail;
  } catch (err) {
    console.warn("[DeepCrawl/PR] Fetch failed:", err);
    return existingPrRaw ?? null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// ATTOM property detail fetch
// ══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAttomDetail(property: Record<string, any>): Promise<any> {
  if (!process.env.ATTOM_API_KEY) return null;

  const addr = property.address;
  const city = property.city;
  const state = property.state;
  const zip = property.zip;

  if (!addr) return null;

  try {
    const address2 = [city, state, zip].filter(Boolean).join(", ");
    const detail = await getPropertyDetailByAddress(addr, address2);
    if (detail) {
      console.log("[DeepCrawl/ATTOM] Got property detail");
    }
    return detail;
  } catch (err) {
    console.warn("[DeepCrawl/ATTOM] Fetch failed (non-fatal):", err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Grok AI Deep Crawl — with web search tool
// ══════════════════════════════════════════════════════════════════════

async function callGrokDeepCrawl(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  data: DeepCrawlData,
  agentFindingsText?: string,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];

  const systemPrompt = buildGrokSystemPrompt(property, data, dateStr, agentFindingsText);

  // If agents provided findings, Grok acts as a strategist (no web search needed).
  // If no agent findings, Grok falls back to its own web search.
  const hasAgentFindings = !!(agentFindingsText && agentFindingsText.length > 50);

  const userPrompt = hasAgentFindings
    ? `Synthesize the research agent findings with the structured data above to produce a comprehensive distress intelligence analysis for ${data.owner.name} at ${property.address}, ${property.city} ${property.state} ${property.zip}. Cite relevant agent findings in your analysis. Return ONLY the JSON object as specified.`
    : `Perform a deep distress intelligence analysis for ${data.owner.name} at ${property.address}, ${property.city} ${property.state} ${property.zip}. Search the web for the owner's name and city. Return ONLY the JSON object as specified.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000); // 2.5 min timeout

  try {
    const res = await fetch(GROK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        temperature: 0,
        stream: false,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // If agents provided findings, skip web search (saves ~$0.05).
        // Otherwise fall back to Grok's built-in web search.
        ...(hasAgentFindings ? {} : { tools: [{ type: "web_search" }] }),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Grok API ${res.status}: ${body.slice(0, 300)}`);
    }

    const resData = await res.json();

    // xAI Responses API: extract text from nested output structure
    // data.output[] -> { type: 'message', content: [{ type: 'output_text', text: '...' }] }
    let raw = "";
    if (resData.output_text) {
      // Some versions have top-level output_text
      raw = resData.output_text;
    } else if (Array.isArray(resData.output)) {
      for (const item of resData.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c.type === "output_text" && c.text) {
              raw = c.text;
              break;
            }
          }
        }
        if (raw) break;
      }
    }

    console.log("[DeepCrawl/Grok] Raw response length:", raw.length);
    if (!raw) {
      console.warn("[DeepCrawl/Grok] Empty content — full response keys:", Object.keys(resData), "output sample:", JSON.stringify(resData.output ?? resData.choices ?? resData).slice(0, 800));
    }

    // Parse JSON from response — handle reasoning model think blocks and markdown
    let cleaned = raw;
    // Strip <think>...</think> blocks from reasoning models
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    // Try to extract JSON object if surrounded by text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    try {
      const parsed = JSON.parse(cleaned);
      return {
        summary: parsed.summary ?? "Analysis complete",
        urgencyLevel: parsed.urgencyLevel ?? "MEDIUM",
        urgencyReason: parsed.urgencyReason ?? "",
        signalAnalysis: (parsed.signalAnalysis ?? []).map((s: { headline?: string; detail?: string; daysUntilCritical?: number; actionableInsight?: string }) => ({
          headline: s.headline ?? "",
          detail: s.detail ?? "",
          daysUntilCritical: s.daysUntilCritical ?? null,
          actionableInsight: s.actionableInsight ?? "",
        })),
        ownerProfile: parsed.ownerProfile ?? "",
        financialAnalysis: parsed.financialAnalysis ?? "",
        suggestedApproach: parsed.suggestedApproach ?? "",
        redFlags: parsed.redFlags ?? [],
        talkingPoints: parsed.talkingPoints ?? [],
        webFindings: (parsed.webFindings ?? []).map((w: { source?: string; finding?: string }) => ({
          source: w.source ?? "Web",
          finding: w.finding ?? "",
        })),
        estimatedMAO: parsed.estimatedMAO ?? null,
      };
    } catch {
      // If JSON parse fails, wrap raw text
      return {
        summary: raw.slice(0, 500),
        urgencyLevel: "MEDIUM" as const,
        urgencyReason: "AI analysis returned non-structured format",
        signalAnalysis: [],
        ownerProfile: "",
        financialAnalysis: "",
        suggestedApproach: raw.slice(0, 1000),
        redFlags: [],
        talkingPoints: [],
        webFindings: [],
        estimatedMAO: null,
      };
    }
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function buildGrokSystemPrompt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  data: DeepCrawlData,
  dateStr: string,
  agentFindingsText?: string,
): string {
  const hasAgentFindings = !!(agentFindingsText && agentFindingsText.length > 50);

  const lines: string[] = [
    `You are the Dominion Sentinel Deep Crawl Intelligence Agent (model: ${GROK_MODEL}). Today is ${dateStr}.`,
    "",
    "## Mission",
    hasAgentFindings
      ? "Synthesize structured property data with research agent findings to produce actionable distress intelligence. Research agents have already gathered court records, social media profiles, obituaries, and county records. Your role is to ANALYZE, find connections, and build the acquisition strategy."
      : "Perform deep distress intelligence research on a property and its owner. Your goal is to give a real estate acquisition agent everything they need to make an informed decision and approach the owner effectively.",
    "",
    "## Property Data",
    `Address: ${property.address}, ${property.city} ${property.state} ${property.zip}`,
    `County: ${property.county ?? "Unknown"}`,
    `APN: ${property.apn ?? "Unknown"}`,
    "",
    "## Owner Data",
    `Name: ${data.owner.name}`,
    `Age: ${data.owner.age ?? "Unknown"}`,
    `Ownership: ${data.owner.ownershipYears ?? "Unknown"} years`,
    `Absentee: ${data.owner.absentee ? "Yes" : "No"}`,
    `Deceased: ${data.owner.deceased ? "Yes — estate/probate likely" : "No"}`,
    `Free & Clear: ${data.owner.freeClear ? "Yes" : "No"}`,
    `Last Transfer: ${data.owner.lastTransferDate ?? "Unknown"} / $${data.owner.lastTransferValue?.toLocaleString() ?? "?"} / ${data.owner.lastTransferType ?? "Unknown"}`,
    `Mailing Address: ${data.owner.mailingAddress ?? "Same as property"}`,
    "",
    "## Financial Data",
    `AVM (Automated Valuation): $${data.financial.avm?.toLocaleString() ?? "Unknown"}`,
    `Equity: ${data.financial.equityPercent ?? "?"}%`,
    `Available Equity: $${data.financial.availableEquity?.toLocaleString() ?? "Unknown"}`,
    `Loan Balance: $${data.financial.loanBalance?.toLocaleString() ?? "Unknown"}`,
    `Tax Assessed: $${data.financial.taxAssessed?.toLocaleString() ?? "Unknown"}`,
    `Annual Tax: $${data.financial.taxAmount?.toLocaleString() ?? "Unknown"}`,
    "",
    "## Distress Signals",
  ];

  if (data.signals.length > 0) {
    for (const s of data.signals) {
      const parts = [`- ${s.type.replace(/_/g, " ").toUpperCase()}`];
      if (s.filingDate) parts.push(`filed ${s.filingDate}`);
      if (s.amount) parts.push(`$${s.amount.toLocaleString()}`);
      if (s.stage) parts.push(`stage: ${s.stage}`);
      if (s.auctionDate) parts.push(`auction: ${s.auctionDate}`);
      if (s.lender) parts.push(`lender: ${s.lender}`);
      if (s.installmentsBehind) parts.push(`${s.installmentsBehind} installments behind`);
      parts.push(`(source: ${s.source})`);
      lines.push(parts.join(" · "));
    }
  } else {
    lines.push("- No distress signals on record");
  }

  if (data.callHistory.length > 0) {
    lines.push("", "## Call History");
    for (const c of data.callHistory) {
      lines.push(`- ${new Date(c.date).toLocaleDateString()} — ${c.disposition}${c.notes ? `: ${c.notes}` : ""}`);
    }
  }

  // ── Agent findings section (if available) ──
  if (hasAgentFindings && agentFindingsText) {
    lines.push("", agentFindingsText);
  }

  lines.push(
    "",
    "## Instructions",
  );

  if (hasAgentFindings) {
    lines.push(
      "1. SYNTHESIZE the research agent findings above with the structured property data. Look for connections: a court filing + a LinkedIn relocation = high motivation to sell.",
      "2. Analyze each distress signal with actual dates, dollar amounts, and timeline pressure. Calculate days until critical deadlines.",
      "3. Profile the owner's likely mindset, situation, and motivation to sell — use agent findings for depth.",
      "4. Assess deal economics: equity position, maximum allowable offer (MAO) range assuming 65-70% of ARV minus repairs.",
      "5. Suggest specific approach strategy and talking points tailored to this owner's situation. Reference specific findings.",
      "6. Flag any red flags (litigator risk, title issues, environmental concerns, etc).",
      "7. Cite relevant agent findings in your webFindings array — include the agent's source URLs and dates.",
    );
  } else {
    lines.push(
      "1. SEARCH THE WEB for the owner name + city. Look for: social media profiles, court records, obituaries, news articles, public filings, LinkedIn, business registrations.",
      "2. Analyze each distress signal with actual dates, dollar amounts, and timeline pressure. Calculate days until critical deadlines.",
      "3. Profile the owner's likely mindset, situation, and motivation to sell.",
      "4. Assess deal economics: equity position, maximum allowable offer (MAO) range assuming 65-70% of ARV minus repairs.",
      "5. Suggest specific approach strategy and talking points tailored to this owner's situation.",
      "6. Flag any red flags (litigator risk, title issues, environmental concerns, etc).",
    );
  }

  lines.push(
    "",
    "## Output Format",
    "Return ONLY a JSON object (no markdown, no explanation, no code fences):",
    "{",
    '  "summary": "2-3 sentence executive summary of the situation",',
    '  "urgencyLevel": "CRITICAL|HIGH|MEDIUM|LOW",',
    '  "urgencyReason": "Why this urgency level",',
    '  "signalAnalysis": [',
    '    { "headline": "SIGNAL TYPE — key fact", "detail": "Full analysis with dates/amounts", "daysUntilCritical": number_or_null, "actionableInsight": "What to do about it" }',
    "  ],",
    '  "ownerProfile": "2-3 sentences about the owner, their situation, and mindset",',
    '  "financialAnalysis": "Equity position, deal economics, spread potential",',
    '  "suggestedApproach": "How to approach this owner — lead with empathy, specific angle",',
    '  "redFlags": ["any concerns or risks"],',
    '  "talkingPoints": ["specific things to say in conversation"],',
    '  "webFindings": [{ "source": "LinkedIn/Obituary/Court/etc", "finding": "What was found" }],',
    '  "estimatedMAO": { "low": number, "high": number, "basis": "calculation explanation" }',
    "}",
  );

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════════════
// Fallback dossier (no Grok available)
// ══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFallbackDossier(data: DeepCrawlData, property: Record<string, any>) {
  const signalTypes = data.signals.map(s => s.type.replace(/_/g, " ")).join(", ");
  const hasForeclosure = data.signals.some(s => s.type === "pre_foreclosure" || s.type === "foreclosure");
  const hasTaxLien = data.signals.some(s => s.type === "tax_lien" || s.type === "tax_delinquency");

  let urgencyLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
  if (hasForeclosure) urgencyLevel = "CRITICAL";
  else if (hasTaxLien) urgencyLevel = "HIGH";
  else if (data.signals.length >= 3) urgencyLevel = "HIGH";

  const avm = data.financial.avm;
  let mao = null;
  if (avm) {
    const low = Math.round(avm * 0.50);
    const high = Math.round(avm * 0.65);
    mao = { low, high, basis: `Based on AVM of $${avm.toLocaleString()} at 50-65%` };
  }

  return {
    summary: `${data.owner.name} at ${property.address} has ${data.signals.length} distress signal(s): ${signalTypes || "none detected"}. ${data.owner.absentee ? "Absentee owner." : ""} ${data.financial.equityPercent ? `${data.financial.equityPercent}% equity.` : ""}`.trim(),
    urgencyLevel,
    urgencyReason: `${data.signals.length} distress signal(s) detected. ${hasForeclosure ? "Active foreclosure." : ""} ${hasTaxLien ? "Tax delinquency." : ""}`.trim(),
    signalAnalysis: data.signals.map(s => ({
      headline: `${s.type.replace(/_/g, " ").toUpperCase()}${s.amount ? ` — $${s.amount.toLocaleString()}` : ""}`,
      detail: `${s.filingDate ? `Filed ${s.filingDate}` : "Filing date unknown"}. ${s.stage ? `Stage: ${s.stage}.` : ""} ${s.lender ? `Lender: ${s.lender}.` : ""} Source: ${s.source}.`,
      daysUntilCritical: null,
      actionableInsight: "Deep research required for full analysis — Grok AI unavailable",
    })),
    ownerProfile: `${data.owner.name}${data.owner.age ? `, ~${data.owner.age} y/o` : ""}${data.owner.ownershipYears ? `, owned ${data.owner.ownershipYears} years` : ""}. ${data.owner.absentee ? "Absentee owner." : ""} ${data.owner.deceased ? "Deceased — estate in probate." : ""}`.trim(),
    financialAnalysis: `AVM: $${avm?.toLocaleString() ?? "?"} · Equity: ${data.financial.equityPercent ?? "?"}% · Loan: $${data.financial.loanBalance?.toLocaleString() ?? "?"}`,
    suggestedApproach: "Approach with empathy. Reference their specific situation.",
    redFlags: [],
    talkingPoints: [],
    webFindings: [],
    estimatedMAO: mao,
  };
}
