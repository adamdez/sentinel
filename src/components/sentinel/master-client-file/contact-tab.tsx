"use client";

// ContactTab extracted from master-client-file-modal.tsx.
// Receives all data via props — no closure over modal state.

import { useState, useEffect, useMemo } from "react";
import {
  ExternalLink, Phone, MessageSquare, Mail, MapPin, User, Lock,
  Loader2, Save, Pencil, ImageIcon, Contact2, Crosshair, Smartphone,
  Scale, Calendar, FileText, Users,
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

  // Imported phones/emails from vendor list import (stored in owner_flags)
  const importPhones = (cf.ownerFlags?.import_phones as string[] | undefined) ?? [];
  const importEmails = (cf.ownerFlags?.import_emails as string[] | undefined) ?? [];

  // Dynamic phone slots — show all returned phones, minimum 5 empty slots
  const initialPhones = (() => {
    const phones: string[] = [];
    const seen = new Set<string>();
    const addUnique = (num: string) => {
      const digits = num.replace(/\D/g, "").slice(-10);
      if (digits.length >= 7 && !seen.has(digits)) { seen.add(digits); phones.push(num); }
    };
    for (const pd of phoneDetails) addUnique(pd.number);
    if (phones.length === 0 && cf.ownerPhone) addUnique(cf.ownerPhone);
    for (const ip of importPhones) addUnique(ip);
    const MIN_PHONE_SLOTS = 5;
    while (phones.length < MIN_PHONE_SLOTS) phones.push("");
    return phones;
  })();
  const [phoneSlots, setPhoneSlots] = useState<string[]>(initialPhones);

  // Dynamic email slots — show all returned emails, minimum 2 empty slots
  const initialEmails = (() => {
    const emails: string[] = [];
    const seen = new Set<string>();
    const addUnique = (em: string) => {
      const lower = em.trim().toLowerCase();
      if (lower.includes("@") && !seen.has(lower)) { seen.add(lower); emails.push(em); }
    };
    for (const ed of emailDetails) addUnique(ed.email);
    if (emails.length === 0 && cf.ownerEmail) addUnique(cf.ownerEmail);
    for (const ie of importEmails) addUnique(ie);
    const MIN_EMAIL_SLOTS = 2;
    while (emails.length < MIN_EMAIL_SLOTS) emails.push("");
    return emails;
  })();
  const [emailSlots, setEmailSlots] = useState<string[]>(initialEmails);

  // Re-sync when overlay updates (after enrichment), preserving imported phones/emails
  useEffect(() => {
    if (overlay) {
      const seen = new Set<string>();
      const addUnique = (arr: string[], num: string) => {
        const digits = num.replace(/\D/g, "").slice(-10);
        if (digits.length >= 7 && !seen.has(digits)) { seen.add(digits); arr.push(num); }
      };
      const newPhones: string[] = [];
      if (overlay.phoneDetails) {
        for (const pd of overlay.phoneDetails) addUnique(newPhones, pd.number);
      } else if (overlay.phones) {
        for (const ph of overlay.phones) addUnique(newPhones, ph);
      }
      for (const ip of importPhones) addUnique(newPhones, ip);
      while (newPhones.length < 5) newPhones.push("");
      setPhoneSlots(newPhones);

      const seenEmail = new Set<string>();
      const addUniqueEmail = (arr: string[], em: string) => {
        const lower = em.trim().toLowerCase();
        if (lower.includes("@") && !seenEmail.has(lower)) { seenEmail.add(lower); arr.push(em); }
      };
      const newEmails: string[] = [];
      if (overlay.emailDetails) {
        for (const ed of overlay.emailDetails) addUniqueEmail(newEmails, ed.email);
      } else if (overlay.emails) {
        for (const em of overlay.emails) addUniqueEmail(newEmails, em);
      }
      for (const ie of importEmails) addUniqueEmail(newEmails, ie);
      while (newEmails.length < 2) newEmails.push("");
      setEmailSlots(newEmails);
    }
  }, [overlay, importPhones, importEmails]);

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
        <div className="rounded-[12px] border border-overlay-6 overflow-hidden">
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
            <div className="absolute inset-0 bg-gradient-to-t from-panel-deep via-panel to-transparent pointer-events-none" />
            {streetViewLink && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 text-xs text-overlay-50">
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
                className="h-7 px-3 rounded-md text-sm font-semibold border border-overlay-10 text-muted-foreground hover:text-foreground transition-colors"
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-7 px-3 rounded-md text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded-md text-sm font-semibold border border-overlay-10 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Property Address ── */}
      <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
        <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />Property Address
        </p>
        {editing ? (
          <div className="grid grid-cols-[1fr] gap-2">
            <input
              value={propertyAddr}
              onChange={(e) => setPropertyAddr(e.target.value)}
              placeholder="Street address"
              className="w-full bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
                placeholder="City"
                className="bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
              />
              <input
                value={propertyState}
                onChange={(e) => setPropertyState(e.target.value)}
                placeholder="State"
                className="bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
              />
              <input
                value={propertyZip}
                onChange={(e) => setPropertyZip(e.target.value)}
                placeholder="ZIP"
                className="bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
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
      <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
        <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Mailing Address
        </p>
        {editing ? (
          <input
            value={mailingAddr}
            onChange={(e) => setMailingAddr(e.target.value)}
            placeholder="Mailing address (if different from property)"
            className="w-full bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
          />
        ) : (
          <p className="text-sm text-foreground">{mailingAddr || <span className="text-muted-foreground/40 italic">No mailing address on file</span>}</p>
        )}
      </div>

      {/* ── Phone Numbers (5 slots) ── */}
      <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="h-3 w-3" />Phone Numbers ({phoneSlots.filter((p) => p.trim().length >= 7).length}/{phoneSlots.length})
          </p>
          {!hasPhones && (
            <button
              onClick={onSkipTrace}
              disabled={skipTracing}
              className="h-6 px-2.5 rounded-md text-xs font-semibold border border-border/30 bg-muted/[0.06] text-foreground hover:bg-muted/[0.12] transition-colors flex items-center gap-1"
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
                  <span className="text-sm text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={phone}
                    onChange={(e) => updatePhone(i, e.target.value)}
                    placeholder={`Phone ${i + 1}`}
                    className="flex-1 bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
              );
            }

            if (!hasPhone) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-overlay-6 bg-overlay-2 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-overlay-3 flex items-center justify-center shrink-0">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground/15">(•••) •••-••••</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-overlay-8 bg-overlay-3 p-2.5">
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
                      {i === 0 && <Badge variant="outline" className="text-xs py-0 px-1 border-primary/30 text-primary">BEST</Badge>}
                      {detail?.dnc && <Badge variant="outline" className="text-xs py-0 px-1 border-border/30 text-foreground">DNC</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {detail?.lineType && detail.lineType.toLowerCase() !== "unknown" && (
                        <span className="text-sm text-muted-foreground capitalize">{detail.lineType}</span>
                      )}
                      {detail?.confidence != null && detail.confidence > 0 && (
                        <span className="text-sm text-muted-foreground">{detail.confidence}%</span>
                      )}
                      {detail?.source && (
                        <Badge variant="outline" className={cn(
                          "text-xs py-0 px-1",
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
                        className="h-7 px-2 rounded-md text-sm font-semibold bg-muted/10 text-foreground hover:bg-muted/20 border border-border/20 transition-all flex items-center gap-1"
                      >
                        ★ Best
                      </button>
                    )}
                    <button
                      onClick={() => onDial(phone)}
                      disabled={calling || detail?.dnc}
                      className="h-7 px-2 rounded-md text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <Phone className="h-3 w-3" />Dial
                    </button>
                    <button
                      onClick={() => onSms(phone)}
                      disabled={detail?.lineType === "landline"}
                      className="h-7 px-2 rounded-md text-sm font-semibold bg-muted/10 text-foreground hover:bg-muted/20 border border-border/20 transition-all flex items-center gap-1 disabled:opacity-30"
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
      <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
        <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Emails ({emailSlots.filter((e) => e.includes("@")).length}/{emailSlots.length})
        </p>
        <div className="space-y-1.5">
          {emailSlots.map((email, i) => {
            const detail = emailDetails[i];
            const hasEmail = email.includes("@");

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder={`Email ${i + 1}`}
                    className="flex-1 bg-overlay-4 border border-overlay-10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30"
                  />
                </div>
              );
            }

            if (!hasEmail) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-overlay-6 bg-overlay-2 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    <span className="text-sm font-mono text-muted-foreground/15">•••••••@•••••.com</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-overlay-8 bg-overlay-3 p-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-primary/60" />
                  <a href={`mailto:${email}`} className="text-sm text-primary hover:underline">{email}</a>
                  {i === 0 && <Badge variant="outline" className="text-xs py-0 px-1 border-primary/30 text-primary">PRIMARY</Badge>}
                  {detail?.deliverable && (
                    <Badge variant="outline" className="text-xs py-0 px-1 border-border/30 text-foreground">Verified</Badge>
                  )}
                  {detail?.source && (
                    <Badge variant="outline" className={cn(
                      "text-xs py-0 px-1",
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
        <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
          <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3 w-3" />Associated Persons ({persons.length})
          </p>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {persons.map((person: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div className="h-7 w-7 rounded-full bg-overlay-4 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{person.name ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-xs py-0 px-1">{person.relation ?? person.role ?? "Owner"}</Badge>
                    {person.source && (
                      <Badge variant="outline" className={cn(
                        "text-xs py-0 px-1",
                        person.source === "batchdata" ? "border-border/30 text-foreground"
                          : String(person.source).startsWith("openclaw") ? "border-border/30 text-foreground"
                          : "border-primary/30 text-primary/70",
                      )}>
                        {person.source === "batchdata" ? "BD" : String(person.source).startsWith("openclaw") ? "OC" : "PR"}
                      </Badge>
                    )}
                  </div>
                  {person.age && <span className="text-sm text-muted-foreground">Age {person.age}</span>}
                  {person.occupation && <span className="text-sm text-muted-foreground ml-2">{person.occupation}</span>}
                  {person.mailing_address && (
                    <p className="text-sm text-muted-foreground/70 mt-0.5">
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

      {/* ── Legal / Probate Metadata ── */}
      <ImportedLegalSection ownerFlags={cf.ownerFlags} />

      {/* ── Imported Contacts (Deceased, Survivor, Petitioner, Attorney) ── */}
      <ImportedContactsSection ownerFlags={cf.ownerFlags} onDial={onDial} onSms={onSms} calling={calling} />

      {/* ── Text Messages ── */}
      <LeadSmsPreview phone={cf.ownerPhone ?? null} onSms={onSms} />
    </div>
  );
}

// ── Legal / Probate metadata from vendor list import ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImportedLegalSection({ ownerFlags }: { ownerFlags: Record<string, any> | null | undefined }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legal = (ownerFlags?.legal_metadata ?? null) as Record<string, any> | null;
  if (!legal) return null;

  const rows: Array<{ label: string; value: string }> = [];
  if (legal.document_type) rows.push({ label: "Document Type", value: legal.document_type });
  if (legal.case_number) rows.push({ label: "Case Number", value: legal.case_number });
  if (legal.file_date) rows.push({ label: "File Date", value: legal.file_date });
  if (legal.date_of_death) rows.push({ label: "Date of Death", value: legal.date_of_death });
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
      <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Scale className="h-3 w-3" />Legal / Probate Info
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col">
            <span className="text-xs text-muted-foreground/60">{row.label}</span>
            <span className="text-sm font-semibold text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Imported contacts: deceased, survivor, petitioner, attorney ────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImportedContactsSection({ ownerFlags, onDial, onSms, calling }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ownerFlags: Record<string, any> | null | undefined;
  onDial: (phone: string) => void;
  onSms: (phone: string) => void;
  calling: boolean;
}) {
  if (!ownerFlags) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deceased = (ownerFlags.deceased_person ?? null) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const survivor = (ownerFlags.survivor_contact ?? null) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const petitioner = (ownerFlags.petitioner_contact ?? null) as Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attorney = (ownerFlags.attorney_contact ?? null) as Record<string, any> | null;

  const hasAny = deceased || survivor || petitioner || attorney;
  if (!hasAny) return null;

  const buildName = (p: Record<string, string | null>) =>
    [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") || null;

  const buildAddr = (p: Record<string, string | null>) => {
    const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards: Array<{ role: string; icon: React.ReactNode; person: Record<string, any> }> = [];
  if (deceased) cards.push({ role: "Deceased", icon: <Calendar className="h-3 w-3" />, person: deceased });
  if (survivor) cards.push({ role: "Survivor", icon: <Users className="h-3 w-3" />, person: survivor });
  if (petitioner) cards.push({ role: "Petitioner / PR", icon: <FileText className="h-3 w-3" />, person: petitioner });
  if (attorney) cards.push({ role: "Attorney", icon: <Scale className="h-3 w-3" />, person: attorney });

  return (
    <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
      <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Users className="h-3 w-3" />Imported Contacts ({cards.length})
      </p>
      <div className="space-y-2">
        {cards.map(({ role, icon, person }) => {
          const name = buildName(person);
          const addr = buildAddr(person);
          const phone = person.phone as string | null;
          const email = person.email as string | null;
          const barNo = person.bar_number as string | null;

          return (
            <div key={role} className="rounded-[10px] border border-overlay-8 bg-overlay-3 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-overlay-4 flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{name ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-xs py-0 px-1">{role}</Badge>
                  </div>
                </div>
                {phone && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onDial(phone)}
                      disabled={calling}
                      className="h-6 px-2 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <Phone className="h-2.5 w-2.5" />Dial
                    </button>
                    <button
                      onClick={() => onSms(phone)}
                      className="h-6 px-2 rounded-md text-xs font-semibold bg-muted/10 text-foreground hover:bg-muted/20 border border-border/20 transition-all flex items-center gap-1"
                    >
                      <MessageSquare className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="pl-9 space-y-0.5 text-sm text-muted-foreground">
                {addr && <p className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{addr}</p>}
                {phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{phone}</p>}
                {email && (
                  <p className="flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
                  </p>
                )}
                {barNo && <p className="flex items-center gap-1"><Scale className="h-3 w-3 shrink-0" />Bar #{barNo}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline SMS preview for the Contact tab ───────────────────────────

function LeadSmsPreview({ phone, onSms }: { phone: string | null; onSms: (phone: string) => void }) {
  const [messages, setMessages] = useState<Array<{ id: string; direction: string; body: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

        const digits = phone.replace(/\D/g, "").slice(-10);
        const e164 = `+1${digits}`;
        const res = await fetch(`/api/twilio/sms/threads/${encodeURIComponent(e164)}?limit=5`, { headers });
        if (res.ok && active) {
          const data = await res.json();
          setMessages((data.messages ?? []).slice(-5));
        }
      } catch { /* silent */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [phone]);

  if (!phone) return null;

  return (
    <div className="rounded-[12px] border border-overlay-6 bg-overlay-2 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" />Text Messages
        </p>
        <button
          onClick={() => onSms(phone)}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Send Text
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground/40 py-2">No text messages with this number</p>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              "text-sm px-3 py-1.5 rounded-[10px] max-w-[90%]",
              msg.direction === "outbound"
                ? "ml-auto bg-primary/8 border border-primary/12 text-foreground"
                : "mr-auto bg-overlay-4 border border-overlay-6 text-foreground",
            )}>
              <p className="whitespace-pre-wrap break-words text-xs">{msg.body}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                {new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
