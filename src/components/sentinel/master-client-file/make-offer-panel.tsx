"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ClientFile } from "@/components/sentinel/master-client-file-helpers";
import { extractOfferPrepSnapshot, extractOfferStatusSnapshot, offerStatusTruthLabel } from "@/lib/leads-data";
import {
  buildMakeOfferSupportCheck,
  createDefaultMakeOfferDraft,
  type MakeOfferDraft,
  type OfferExecutionStatus,
} from "@/lib/make-offer";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ExternalLink, FileSignature, Loader2 } from "lucide-react";

function formatExecutionLabel(status: string) {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toServerPayload(cf: ClientFile, draft: MakeOfferDraft) {
  const purchasePrice = Number.parseInt(draft.purchasePrice.replace(/[^\d]/g, ""), 10);
  const earnestMoney = Number.parseInt(draft.earnestMoney.replace(/[^\d]/g, ""), 10);
  const inspectionPeriodDays = Number.parseInt(draft.inspectionPeriodDays.replace(/[^\d]/g, ""), 10);
  const expirationAt = `${draft.expirationDate}T${draft.expirationTime || "17:00"}:00`;

  return {
    leadId: cf.id,
    purchasePrice,
    earnestMoney,
    closeDate: draft.closeDate,
    inspectionPeriodDays,
    expirationAt: new Date(expirationAt).toISOString(),
    buyerEntity: draft.buyerEntity.trim(),
    buyerSignerName: draft.buyerSignerName.trim(),
    buyerSignerTitle: draft.buyerSignerTitle.trim() || null,
    titleCompany: draft.titleCompany.trim() || null,
    sellerSigners: draft.sellerSigners
      .map((signer) => ({
        name: signer.name.trim(),
        email: signer.email.trim(),
      }))
      .filter((signer) => signer.name.length > 0 || signer.email.length > 0),
    notes: draft.notes.trim() || null,
  };
}

export function MakeOfferPanel({
  cf,
  onRefresh,
}: {
  cf: ClientFile;
  onRefresh?: () => void;
}) {
  const offerPrep = useMemo(() => extractOfferPrepSnapshot(cf.ownerFlags), [cf.ownerFlags]);
  const offerStatus = useMemo(() => extractOfferStatusSnapshot(cf.ownerFlags), [cf.ownerFlags]);
  const support = useMemo(() => buildMakeOfferSupportCheck({
    state: cf.state,
    decisionMakerConfirmed: cf.decisionMakerConfirmed,
    tags: cf.tags,
    source: cf.source,
    sourceListName: cf.sourceListName,
    qualificationRoute: cf.qualificationRoute,
  }), [cf]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<MakeOfferDraft>(() => createDefaultMakeOfferDraft({
    offerAmount: cf.offerAmount,
    offerStatusAmount: offerStatus.amount,
    sellerName: cf.ownerName,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<OfferExecutionStatus[]>([]);

  const reloadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/offers?leadId=${cf.id}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const flattened = ((data.offers ?? []) as Array<Record<string, unknown>>).flatMap((offer) => {
        const executions = Array.isArray(offer.executions) ? offer.executions : [];
        return executions.map((execution) => ({
          offerId: String(offer.id),
          dealId: String(offer.deal_id),
          offerType: String(offer.offer_type ?? "initial"),
          amount: Number(offer.amount ?? 0),
          offerStatus: String(offer.status ?? "pending"),
          provider: String((execution as Record<string, unknown>).provider ?? "docusign"),
          providerStatus: String((execution as Record<string, unknown>).provider_status ?? "created"),
          templateKey: ((execution as Record<string, unknown>).template_key as string | null) ?? null,
          envelopeId: ((execution as Record<string, unknown>).envelope_id as string | null) ?? null,
          senderViewUrl: ((execution as Record<string, unknown>).sender_view_url as string | null) ?? null,
          sentAt: ((execution as Record<string, unknown>).sent_at as string | null) ?? null,
          completedAt: ((execution as Record<string, unknown>).completed_at as string | null) ?? null,
          voidedAt: ((execution as Record<string, unknown>).voided_at as string | null) ?? null,
          respondedAt: (offer.responded_at as string | null) ?? null,
          expiresAt: (offer.expires_at as string | null) ?? null,
          createdAt: String((execution as Record<string, unknown>).created_at ?? offer.created_at),
        }));
      });

      setHistory(flattened);
    } catch (error) {
      console.error("[MakeOfferPanel] history error:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [cf.id]);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);

  const resetDraft = useCallback(() => {
    setDraft(createDefaultMakeOfferDraft({
      offerAmount: cf.offerAmount,
      offerStatusAmount: offerStatus.amount,
      sellerName: cf.ownerName,
    }));
  }, [cf.offerAmount, cf.ownerName, offerStatus.amount]);

  const updateSigner = useCallback((index: number, patch: { name?: string; email?: string }) => {
    setDraft((prev) => {
      const nextSigners = [...prev.sellerSigners];
      nextSigners[index] = {
        ...nextSigners[index],
        ...patch,
      };
      return { ...prev, sellerSigners: nextSigners };
    });
  }, []);

  const addSigner = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      sellerSigners: [...prev.sellerSigners, { name: "", email: "" }],
    }));
  }, []);

  const removeSigner = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      sellerSigners: prev.sellerSigners.filter((_, signerIndex) => signerIndex !== index),
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const payload = toServerPayload(cf, draft);
    if (!Number.isFinite(payload.purchasePrice) || payload.purchasePrice <= 0) {
      toast.error("Enter a valid purchase price.");
      return;
    }
    if (!Number.isFinite(payload.earnestMoney) || payload.earnestMoney < 0) {
      toast.error("Enter a valid earnest money amount.");
      return;
    }
    if (!Number.isFinite(payload.inspectionPeriodDays) || payload.inspectionPeriodDays < 0) {
      toast.error("Enter a valid inspection period.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Session expired - cannot prepare offer.");
        return;
      }

      const res = await fetch("/api/offers/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const unsupportedReasons = Array.isArray(data.unsupported_reasons) ? data.unsupported_reasons : [];
        toast.error(
          unsupportedReasons.length > 0
            ? unsupportedReasons[0]
            : data.error ?? `HTTP ${res.status}`,
        );
        return;
      }

      if (typeof data.sender_view_url === "string" && data.sender_view_url.length > 0) {
        window.open(data.sender_view_url, "_blank", "noopener,noreferrer");
      }

      toast.success("Offer draft prepared in DocuSign.");
      setDialogOpen(false);
      await reloadHistory();
      onRefresh?.();
    } catch (error) {
      console.error("[MakeOfferPanel] prepare error:", error);
      toast.error("Could not prepare offer.");
    } finally {
      setSubmitting(false);
    }
  }, [cf, draft, onRefresh, reloadHistory]);

  return (
    <div className="rounded-[10px] border border-overlay-8 bg-overlay-2 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offer Execution</p>
          <p className="mt-1 text-sm text-foreground/85">
            Turn this file into a real DocuSign-backed Washington cash offer.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            resetDraft();
            setDialogOpen(true);
          }}
          disabled={!support.supported}
        >
          <FileSignature className="h-3.5 w-3.5" />
          Make Offer
        </Button>
      </div>

      {support.reasons.length > 0 && (
        <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/[0.06] p-2.5 text-xs text-amber-100/80 space-y-1">
          {support.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-[8px] border border-overlay-8 bg-overlay-3 p-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Offer Prep</p>
          <p className="mt-1 text-foreground font-medium">
            {offerPrep.maoLow != null || offerPrep.maoHigh != null
              ? `${offerPrep.maoLow != null ? formatCurrency(offerPrep.maoLow) : "?"} - ${offerPrep.maoHigh != null ? formatCurrency(offerPrep.maoHigh) : "?"}`
              : "No saved MAO range"}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {offerPrep.updatedAt ? `Updated ${new Date(offerPrep.updatedAt).toLocaleDateString()}` : "Save offer prep first for stronger defaults."}
          </p>
        </div>
        <div className="rounded-[8px] border border-overlay-8 bg-overlay-3 p-2.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Offer Status</p>
          <p className="mt-1 text-foreground font-medium">
            {offerStatus.status ? offerStatusTruthLabel(offerStatus.status) : "No legal offer yet"}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {offerStatus.amount != null ? formatCurrency(offerStatus.amount) : "No tracked offer amount"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Recent Legal Offers</p>
          {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" /> : null}
        </div>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.slice(0, 3).map((item) => (
              <div key={`${item.offerId}-${item.createdAt}`} className="rounded-[8px] border border-overlay-8 bg-overlay-3 p-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{formatCurrency(item.amount)}</span>
                    <Badge variant="outline" className="text-[10px] border-overlay-15">
                      {formatExecutionLabel(item.providerStatus)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground/70">{formatExecutionLabel(item.offerType)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown date"}
                  </p>
                </div>
                {item.senderViewUrl ? (
                  <a
                    href={item.senderViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-foreground hover:underline shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Review
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">No DocuSign offer drafts yet.</p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl border-overlay-10 bg-panel text-foreground">
          <DialogHeader>
            <DialogTitle>Make Offer</DialogTitle>
            <DialogDescription>
              Sentinel will prefill a Washington cash PSA and send you into DocuSign review.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Price</label>
              <Input value={draft.purchasePrice} onChange={(e) => setDraft((prev) => ({ ...prev, purchasePrice: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Earnest Money</label>
              <Input value={draft.earnestMoney} onChange={(e) => setDraft((prev) => ({ ...prev, earnestMoney: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Close Date</label>
              <Input type="date" value={draft.closeDate} onChange={(e) => setDraft((prev) => ({ ...prev, closeDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Inspection Days</label>
              <Input value={draft.inspectionPeriodDays} onChange={(e) => setDraft((prev) => ({ ...prev, inspectionPeriodDays: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</label>
              <Input type="date" value={draft.expirationDate} onChange={(e) => setDraft((prev) => ({ ...prev, expirationDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Time</label>
              <Input type="time" value={draft.expirationTime} onChange={(e) => setDraft((prev) => ({ ...prev, expirationTime: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Buyer Entity</label>
              <Input value={draft.buyerEntity} onChange={(e) => setDraft((prev) => ({ ...prev, buyerEntity: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Buyer Signer Name</label>
              <Input value={draft.buyerSignerName} onChange={(e) => setDraft((prev) => ({ ...prev, buyerSignerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Buyer Signer Title</label>
              <Input value={draft.buyerSignerTitle} onChange={(e) => setDraft((prev) => ({ ...prev, buyerSignerTitle: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Title / Escrow Company</label>
              <Input value={draft.titleCompany} onChange={(e) => setDraft((prev) => ({ ...prev, titleCompany: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Seller Signers</label>
              <Button size="sm" variant="outline" onClick={addSigner}>Add Signer</Button>
            </div>
            <div className="space-y-2">
              {draft.sellerSigners.map((signer, index) => (
                <div key={`seller-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input value={signer.name} placeholder="Seller name" onChange={(e) => updateSigner(index, { name: e.target.value })} />
                  <Input value={signer.email} placeholder="seller@email.com" onChange={(e) => updateSigner(index, { email: e.target.value })} />
                  <Button size="sm" variant="outline" onClick={() => removeSigner(index)} disabled={draft.sellerSigners.length === 1}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Notes For This Offer</label>
            <Textarea value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
          </div>

          <div className="rounded-[8px] border border-overlay-8 bg-overlay-3 p-3 text-sm">
            <p className="font-medium text-foreground">Pre-send review</p>
            <div className="mt-2 space-y-1 text-muted-foreground/80">
              <p>{cf.fullAddress}</p>
              <p>{cf.apn ? `APN ${cf.apn}` : "No APN saved"}</p>
              <p>Template: Washington cash PSA</p>
              <p>Recipients: {draft.sellerSigners.map((signer) => signer.email).filter(Boolean).join(", ") || "Add seller email"}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting || !support.supported}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
              {submitting ? "Preparing..." : "Prepare in DocuSign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
