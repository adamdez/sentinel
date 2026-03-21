"use client";

// ContactTab extracted from master-client-file-modal.tsx.
// Receives all data via props — no closure over modal state.

import { useState, useEffect, useMemo } from "react";
import {
  ExternalLink, Phone, MessageSquare, Mail, MapPin, User, Lock,
  Loader2, Save, Pencil, ImageIcon, Contact2, Crosshair, Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  type ClientFile,
  buildAddress,
  extractLatLng,
} from "../master-client-file-helpers";
import {
  getSatelliteTileUrl,
  getGoogleStreetViewLink,
} from "@/components/sentinel/comps/comps-map";
import { CopyBtn } from "../master-client-file-parts";
import type { PhoneDetail, EmailDetail, SkipTraceOverlay } from "./contact-types";

export function ContactTab({ cf, overlay, onSkipTrace, skipTracing, onDial, onSms, calling, onRefresh }: {
  cf: ClientFile; overlay: SkipTraceOverlay | null;
  onSkipTrace: () => void; skipTracing: boolean;
  onDial: (phone: string) => void; onSms: (phone: string) => void;
  calling: boolean; onRefresh?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  // ── Image (Street View or satellite fallback) ──
  const { lat: propLat, lng: propLng } = extractLatLng(cf);
  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // ── Phone & email data ──
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as Record<string, unknown>[]) ?? [];

  // manual_phones: string[] saved by the contact editor
  // all_phones: PhoneDetail[] from skip-trace enrichment
  // Load priority: overlay (just ran skip-trace) → all_phones (enriched) → manual_phones (operator-entered) → ownerPhone
  const rawManualPhones = (cf.ownerFlags?.manual_phones as string[] | undefined) ?? [];
  const phoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? rawManualPhones.filter(Boolean).map((number) => ({
        number,
        lineType: "unknown" as const,
        confidence: 0,
        dnc: false,
        source: "manual",
      }));
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];

  // ── Mailing address from PR raw data ──
  const prMailAddr = prRaw.MailAddress ?? prRaw.MailingAddress ?? null;
  const prMailCity = prRaw.MailCity ?? null;
  const prMailState = prRaw.MailState ?? null;
  const prMailZip = prRaw.MailZip ?? null;
  const mailingFromPersons = persons.find((p: Record<string, unknown>) => p.mailing_address || p.mailingAddress);
  const safeMailing = (val: unknown): string => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object" && val !== null) {
      const a = val as Record<string, unknown>;
      return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
    }
    return "";
  };
  const defaultMailing = prMailAddr
    ? [prMailAddr, prMailCity, prMailState, prMailZip].filter(Boolean).join(", ")
    : safeMailing(mailingFromPersons?.mailing_address) || safeMailing(mailingFromPersons?.mailingAddress);

  // ── Editable state ──
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertyAddr, setPropertyAddr] = useState(cf.address ?? "");
  const [propertyCity, setPropertyCity] = useState(cf.city ?? "");
  const [propertyState, setPropertyState] = useState(cf.state ?? "");
  const [propertyZip, setPropertyZip] = useState(cf.zip ?? "");
  const [mailingAddr, setMailingAddr] = useState(defaultMailing);

  // Dynamic phone slots — show all returned phones, minimum 5 empty slots
  const initialPhones = (() => {
    const phones: string[] = [];
    for (const pd of phoneDetails) phones.push(pd.number);
    if (phones.length === 0 && cf.ownerPhone) phones.push(cf.ownerPhone);
    const MIN_PHONE_SLOTS = 5;
    while (phones.length < MIN_PHONE_SLOTS) phones.push("");
    return phones;
  })();
  const [phoneSlots, setPhoneSlots] = useState<string[]>(initialPhones);

  // Dynamic email slots — show all returned emails, minimum 2 empty slots
  const initialEmails = (() => {
    const emails: string[] = [];
    for (const ed of emailDetails) emails.push(ed.email);
    if (emails.length === 0 && cf.ownerEmail) emails.push(cf.ownerEmail);
    const MIN_EMAIL_SLOTS = 2;
    while (emails.length < MIN_EMAIL_SLOTS) emails.push("");
    return emails;
  })();
  const [emailSlots, setEmailSlots] = useState<string[]>(initialEmails);

  // Re-sync when overlay updates (after enrichment)
  useEffect(() => {
    if (overlay) {
      const newPhones: string[] = [];
      if (overlay.phoneDetails) {
        for (const pd of overlay.phoneDetails) newPhones.push(pd.number);
      } else if (overlay.phones) {
        for (const ph of overlay.phones) newPhones.push(ph);
      }
      while (newPhones.length < 5) newPhones.push("");
      setPhoneSlots(newPhones);

      const newEmails: string[] = [];
      if (overlay.emailDetails) {
        for (const ed of overlay.emailDetails) newEmails.push(ed.email);
      } else if (overlay.emails) {
        for (const em of overlay.emails) newEmails.push(em);
      }
      while (newEmails.length < 2) newEmails.push("");
      setEmailSlots(newEmails);
    }
  }, [overlay]);

  const updatePhone = (i: number, val: string) => {
    setPhoneSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };
  const promotePhone = (i: number) => {
    // Move slot i to position 0 (becomes the BEST / owner_phone on save)
    setPhoneSlots((prev) => {
      const next = [...prev];
      const [promoted] = next.splice(i, 1);
      next.unshift(promoted);
      return next;
    });
  };
  const updateEmail = (i: number, val: string) => {
    setEmailSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };

  const hasChanges = useMemo(() => {
    const origPhones = initialPhones;
    const origEmails = initialEmails;
    return (
      propertyAddr !== (cf.address ?? "") ||
      propertyCity !== (cf.city ?? "") ||
      propertyState !== (cf.state ?? "") ||
      propertyZip !== (cf.zip ?? "") ||
      mailingAddr !== defaultMailing ||
      phoneSlots.some((p, i) => p !== origPhones[i]) ||
      emailSlots.some((e, i) => e !== origEmails[i])
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyAddr, propertyCity, propertyState, propertyZip, mailingAddr, phoneSlots, emailSlots]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        return;
      }

      const filledPhones = phoneSlots.filter((p) => p.trim().length >= 7);
      const filledEmails = emailSlots.filter((e) => e.includes("@"));
      const res = await fetch("/api/properties/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          property_id: cf.propertyId,
          lead_id: cf.id,
          fields: {
            address: propertyAddr.trim(),
            city: propertyCity.trim(),
            state: propertyState.trim(),
            zip: propertyZip.trim(),
            owner_phone: filledPhones[0] || null,
            owner_email: filledEmails[0] || null,
            owner_flags: {
              mailing_address: mailingAddr.trim() || null,
              manual_phones: filledPhones,
              manual_emails: filledEmails,
              contact_updated_at: new Date().toISOString(),
            },
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || !data.success) {
        throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      }

      toast.success("Contact info saved");
      setEditing(false);
      onRefresh?.();
    } catch (err) {
      console.error("[Contact] Save error:", err);
      toast.error("Failed to save contact info");
    } finally {
      setSaving(false);
    }
  };

  // Show enrich button when no phones are populated (regardless of enriched badge)
  const hasPhones = phoneSlots.some((p) => p.trim().length >= 7);

  return (
    <div className="space-y-4 max-w-[680px] mx-auto">
      {/* ── Street View / Satellite Image ── */}
      {imageUrl && (
        <div className="rounded-[12px] border border-white/[0.06] overflow-hidden">
          <a
            href={streetViewLink ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-44 group cursor-pointer"
            onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
          >
            <img
              src={imageUrl}
              alt="Property"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {streetViewLink && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] text-white/50">
              <ImageIcon className="h-2.5 w-2.5" />{streetViewUrl ? "Street View" : "Satellite"}
            </div>
          </a>
        </div>
      )}

      {/* ── Edit / Save controls ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Contact2 className="h-4 w-4 text-primary/60" />
          Contact Information
        </h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-7 px-3 rounded-md text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Property Address ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />Property Address
        </p>
        {editing ? (
          <div className="grid grid-cols-[1fr] gap-2">
            <input
              value={propertyAddr}
              onChange={(e) => setPropertyAddr(e.target.value)}
              placeholder="Street address"
              className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
                placeholder="City"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
              />
              <input
                value={propertyState}
                onChange={(e) => setPropertyState(e.target.value)}
                placeholder="State"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
              />
              <input
                value={propertyZip}
                onChange={(e) => setPropertyZip(e.target.value)}
                placeholder="ZIP"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{buildAddress(propertyAddr, propertyCity, propertyState, propertyZip) || "—"}</p>
            {(propertyAddr || propertyCity) && <CopyBtn text={buildAddress(propertyAddr, propertyCity, propertyState, propertyZip)} />}
          </div>
        )}
      </div>

      {/* ── Mailing Address ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Mailing Address
        </p>
        {editing ? (
          <input
            value={mailingAddr}
            onChange={(e) => setMailingAddr(e.target.value)}
            placeholder="Mailing address (if different from property)"
            className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
          />
        ) : (
          <p className="text-sm text-foreground">{mailingAddr || <span className="text-muted-foreground/40 italic">No mailing address on file</span>}</p>
        )}
      </div>

      {/* ── Phone Numbers (5 slots) ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="h-3 w-3" />Phone Numbers ({phoneSlots.filter((p) => p.trim().length >= 7).length}/{phoneSlots.length})
          </p>
          {!hasPhones && (
            <button
              onClick={onSkipTrace}
              disabled={skipTracing}
              className="h-6 px-2.5 rounded-md text-[9px] font-semibold border border-border/30 bg-muted/[0.06] text-foreground hover:bg-muted/[0.12] transition-colors flex items-center gap-1"
            >
              {skipTracing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
              {skipTracing ? "Deep Skipping..." : "~90s Deep Skip"}
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {phoneSlots.map((phone, i) => {
            const detail = phoneDetails[i];
            const hasPhone = phone.trim().length >= 7;

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={phone}
                    onChange={(e) => updatePhone(i, e.target.value)}
                    placeholder={`Phone ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
              );
            }

            if (!hasPhone) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground/15">(•••) •••-••••</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                    detail?.lineType === "mobile" ? "bg-muted/10" : "bg-primary/10",
                  )}>
                    {detail?.lineType === "mobile" ? <Smartphone className="h-3.5 w-3.5 text-foreground" /> : <Phone className="h-3.5 w-3.5 text-primary/70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold font-mono text-foreground">{phone}</span>
                      {i === 0 && <Badge variant="outline" className="text-[7px] py-0 px-1 border-primary/30 text-primary">BEST</Badge>}
                      {detail?.dnc && <Badge variant="outline" className="text-[7px] py-0 px-1 border-border/30 text-foreground">DNC</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {detail?.lineType && detail.lineType.toLowerCase() !== "unknown" && (
                        <span className="text-[10px] text-muted-foreground capitalize">{detail.lineType}</span>
                      )}
                      {detail?.confidence != null && detail.confidence > 0 && (
                        <span className="text-[10px] text-muted-foreground">{detail.confidence}%</span>
                      )}
                      {detail?.source && (
                        <Badge variant="outline" className={cn(
                          "text-[7px] py-0 px-1",
                          detail.source === "batchdata" ? "border-border/30 text-foreground"
                            : String(detail.source).startsWith("openclaw") ? "border-border/30 text-foreground"
                            : "border-primary/30 text-primary/70",
                        )}>
                          {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {i > 0 && (
                      <button
                        onClick={() => promotePhone(i)}
                        title="Set as primary (Best) number — click Save to persist"
                        className="h-7 px-2 rounded-md text-[10px] font-semibold bg-muted/10 text-foreground hover:bg-muted/20 border border-border/20 transition-all flex items-center gap-1"
                      >
                        ★ Best
                      </button>
                    )}
                    <button
                      onClick={() => onDial(phone)}
                      disabled={calling || detail?.dnc}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <Phone className="h-3 w-3" />Dial
                    </button>
                    <button
                      onClick={() => onSms(phone)}
                      disabled={detail?.lineType === "landline"}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-muted/10 text-foreground hover:bg-muted/20 border border-border/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Emails (dynamic slots) ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Emails ({emailSlots.filter((e) => e.includes("@")).length}/{emailSlots.length})
        </p>
        <div className="space-y-1.5">
          {emailSlots.map((email, i) => {
            const detail = emailDetails[i];
            const hasEmail = email.includes("@");

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder={`Email ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
              );
            }

            if (!hasEmail) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    <span className="text-sm font-mono text-muted-foreground/15">•••••••@•••••.com</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-primary/60" />
                  <a href={`mailto:${email}`} className="text-sm text-primary hover:underline">{email}</a>
                  {i === 0 && <Badge variant="outline" className="text-[8px] py-0 px-1 border-primary/30 text-primary">PRIMARY</Badge>}
                  {detail?.deliverable && (
                    <Badge variant="outline" className="text-[7px] py-0 px-1 border-border/30 text-foreground">Verified</Badge>
                  )}
                  {detail?.source && (
                    <Badge variant="outline" className={cn(
                      "text-[7px] py-0 px-1",
                      detail.source === "batchdata" ? "border-border/30 text-foreground"
                        : String(detail.source).startsWith("openclaw") ? "border-border/30 text-foreground"
                        : "border-primary/30 text-primary/70",
                    )}>
                      {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Associated Persons ── */}
      {persons.length > 0 && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3 w-3" />Associated Persons ({persons.length})
          </p>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {persons.map((person: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div className="h-7 w-7 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{person.name ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-[7px] py-0 px-1">{person.relation ?? person.role ?? "Owner"}</Badge>
                    {person.source && (
                      <Badge variant="outline" className={cn(
                        "text-[7px] py-0 px-1",
                        person.source === "batchdata" ? "border-border/30 text-foreground"
                          : String(person.source).startsWith("openclaw") ? "border-border/30 text-foreground"
                          : "border-primary/30 text-primary/70",
                      )}>
                        {person.source === "batchdata" ? "BD" : String(person.source).startsWith("openclaw") ? "OC" : "PR"}
                      </Badge>
                    )}
                  </div>
                  {person.age && <span className="text-[10px] text-muted-foreground">Age {person.age}</span>}
                  {person.occupation && <span className="text-[10px] text-muted-foreground ml-2">{person.occupation}</span>}
                  {person.mailing_address && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {typeof person.mailing_address === "string"
                        ? person.mailing_address
                        : typeof person.mailing_address === "object"
                          ? [person.mailing_address.street, person.mailing_address.city, person.mailing_address.state, person.mailing_address.zip].filter(Boolean).join(", ")
                          : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
