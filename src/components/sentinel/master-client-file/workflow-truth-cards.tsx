"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BuyerFitVisibility, DispoReadinessVisibility, OfferStatusTruth } from "@/lib/leads-data";
import { Circle, Loader2, Save, Target, Users } from "lucide-react";

type OfferStatusSnapshotDraft = {
  status: OfferStatusTruth | "";
  amount: string;
  amountLow: string;
  amountHigh: string;
  sellerResponseNote: string;
};

type BuyerDispoTruthDraft = {
  buyerFit: BuyerFitVisibility | "";
  dispoStatus: DispoReadinessVisibility | "";
  nextStep: string;
  dispoNote: string;
};

export function OfferStatusTruthCard(props: {
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  draft: OfferStatusSnapshotDraft;
  statusLabel: string;
  statusToneClass: string;
  amountLabel: string;
  sellerResponseNote: string | null;
  updatedLabel: string;
  options: Array<{ id: OfferStatusTruth; label: string }>;
  onEditToggle: (next: boolean) => void;
  onDraftChange: (patch: Partial<OfferStatusSnapshotDraft>) => void;
  onSave: () => void;
}) {
  const {
    canEdit,
    editing,
    saving,
    draft,
    statusLabel,
    statusToneClass,
    amountLabel,
    sellerResponseNote,
    updatedLabel,
    options,
    onEditToggle,
    onDraftChange,
    onSave,
  } = props;

  const isEmpty = statusLabel === "Not set" && amountLabel === "Not set" && updatedLabel === "Not set";

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-primary" />
        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Offer Status</p>
        <Badge variant="outline" className="text-xs border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        {canEdit && !isEmpty && (
          <button
            type="button"
            onClick={() => onEditToggle(!editing)}
            className="ml-auto text-sm text-primary/75 hover:text-primary transition-colors"
            disabled={saving}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Status</span>
              <select
                value={draft.status}
                onChange={(e) => onDraftChange({ status: (e.target.value as OfferStatusTruth | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              >
                <option value="">Not set</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Offer Amount (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amount}
                onChange={(e) => onDraftChange({ amount: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Offer Range Low (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amountLow}
                onChange={(e) => onDraftChange({ amountLow: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Offer Range High (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amountHigh}
                onChange={(e) => onDraftChange({ amountHigh: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Seller Response Note (optional)</span>
            <textarea
              value={draft.sellerResponseNote}
              onChange={(e) => onDraftChange({ sellerResponseNote: e.target.value })}
              rows={2}
              placeholder="Seller reaction, objection, or revision context..."
              className="w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-primary/30"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground/65">
              Last updated: <span className="text-foreground/85">{updatedLabel}</span>
            </p>
            <Button size="sm" className="h-7 text-sm" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Offer Status
            </Button>
          </div>
        </div>
      ) : isEmpty ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground/80">No offer submitted yet</p>
          <p className="text-sm text-muted-foreground/50">Set up offer details when ready to present</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEditToggle(true)}
              className="text-sm text-primary/75 hover:text-primary transition-colors font-medium"
            >
              Set up offer
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", statusToneClass)}>
              {statusLabel}
            </span>
            <span className="text-sm text-muted-foreground/75">Amount/Range: <span className="text-foreground font-medium">{amountLabel}</span></span>
          </div>
          {sellerResponseNote && (
            <p className="text-sm text-muted-foreground/80">
              Seller response: <span className="text-foreground/90">{sellerResponseNote}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground/70">
            Last updated: <span className="text-foreground/85">{updatedLabel}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function BuyerDispoVisibilityCard(props: {
  actionMissing: boolean;
  actionStale: boolean;
  buyerFitLabel: string;
  buyerFitToneClass: string;
  dispoReadinessLabel: string;
  dispoReadinessToneClass: string;
  hint: string;
  nextStep: string;
  readinessHigh: boolean;
  nextActionLabel: string;
}) {
  const {
    actionMissing,
    actionStale,
    buyerFitLabel,
    buyerFitToneClass,
    dispoReadinessLabel,
    dispoReadinessToneClass,
    hint,
    nextStep,
    readinessHigh,
    nextActionLabel,
  } = props;

  const isPreOffer = buyerFitLabel === "Unknown" && dispoReadinessLabel === "Not Ready";

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-primary" />
        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Buyer / Dispo Visibility</p>
        <Badge variant="outline" className="text-xs border-white/[0.14] text-muted-foreground">Derived</Badge>
        {(actionMissing || actionStale) && (
          <Badge variant="outline" className="text-xs border-border/30 text-foreground">
            Action Needed
          </Badge>
        )}
      </div>
      {isPreOffer ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground/80">Buyer matching available after offer accepted</p>
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 space-y-1">
            <p className="text-sm text-muted-foreground/60">Before buyer/dispo becomes active:</p>
            <ul className="text-sm text-muted-foreground/50 space-y-0.5 list-disc list-inside">
              <li>Seller offer must be submitted and accepted</li>
              <li>Contract terms confirmed</li>
              <li>Property details verified for buyer matching</li>
            </ul>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", buyerFitToneClass)}>
              Buyer Fit: {buyerFitLabel}
            </span>
            <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", dispoReadinessToneClass)}>
              Dispo Readiness: {dispoReadinessLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground/70">{hint}</p>
          <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 space-y-1.5">
            <p className="text-sm text-foreground/90">
              Next step: <span className="font-medium">{nextStep}</span>
            </p>
            {readinessHigh && (
              <p className="text-sm text-muted-foreground/80">
                Buyer/dispo follow-up: <span className="text-foreground font-medium">{nextActionLabel}</span>
              </p>
            )}
            {(actionMissing || actionStale) && (
              <p className="text-sm text-foreground">
                {actionMissing
                  ? "Buyer/dispo readiness is high, but no next action is set."
                  : "Buyer/dispo readiness is high, and next action is overdue."}
                {" "}Use <span className="font-semibold">Set Next Action</span> to keep this path active.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function BuyerDispoTruthCard(props: {
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  draft: BuyerDispoTruthDraft;
  buyerFitLabel: string;
  buyerFitToneClass: string;
  dispoStatusLabel: string;
  dispoStatusToneClass: string;
  readyLabel: string;
  nextStep: string | null;
  dispoNote: string | null;
  updatedLabel: string;
  onEditToggle: (next: boolean) => void;
  onDraftChange: (patch: Partial<BuyerDispoTruthDraft>) => void;
  onSave: () => void;
}) {
  const {
    canEdit,
    editing,
    saving,
    draft,
    buyerFitLabel,
    buyerFitToneClass,
    dispoStatusLabel,
    dispoStatusToneClass,
    readyLabel,
    nextStep,
    dispoNote,
    updatedLabel,
    onEditToggle,
    onDraftChange,
    onSave,
  } = props;

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-primary" />
        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Buyer / Dispo Truth</p>
        <Badge variant="outline" className="text-xs border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditToggle(!editing)}
            className="ml-auto text-sm text-primary/75 hover:text-primary transition-colors"
            disabled={saving}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Buyer Fit</span>
              <select
                value={draft.buyerFit}
                onChange={(e) => onDraftChange({ buyerFit: (e.target.value as BuyerFitVisibility | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              >
                <option value="">Not set</option>
                <option value="broad">Broad</option>
                <option value="narrow">Narrow</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Dispo Status</span>
              <select
                value={draft.dispoStatus}
                onChange={(e) => onDraftChange({ dispoStatus: (e.target.value as DispoReadinessVisibility | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              >
                <option value="">Not set</option>
                <option value="not_ready">Not Ready</option>
                <option value="needs_review">Needs Review</option>
                <option value="ready">Ready</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Next Dispo Step (optional)</span>
            <input
              type="text"
              value={draft.nextStep}
              onChange={(e) => onDraftChange({ nextStep: e.target.value })}
              placeholder="Example: Review with Adam and prep buyer handoff notes"
              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-primary/30"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Dispo Note (optional)</span>
            <textarea
              value={draft.dispoNote}
              onChange={(e) => onDraftChange({ dispoNote: e.target.value })}
              rows={2}
              placeholder="Buyer-fit caveats, seller expectations, or handoff notes..."
              className="w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-primary/30"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground/65">
              Last updated: <span className="text-foreground/85">{updatedLabel}</span>
            </p>
            <Button size="sm" className="h-7 text-sm" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Buyer/Dispo Truth
            </Button>
          </div>
        </div>
      ) : (buyerFitLabel === "Not set" && dispoStatusLabel === "Not set" && !nextStep && !dispoNote) ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground/80">Complete qualification and negotiation before buyer-side prep</p>
          <p className="text-sm text-muted-foreground/50">Buyer fit and dispo status will be set once the deal progresses past offer stage</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => onEditToggle(true)}
              className="text-sm text-primary/75 hover:text-primary transition-colors font-medium"
            >
              Set buyer/dispo details
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", buyerFitToneClass)}>
              Buyer Fit: {buyerFitLabel}
            </span>
            <span className={cn("text-sm px-2 py-0.5 rounded border font-medium", dispoStatusToneClass)}>
              Dispo Status: {dispoStatusLabel}
            </span>
            <span className="text-sm text-muted-foreground/75">{readyLabel}</span>
          </div>
          <p className="text-sm text-muted-foreground/80">
            Next step: <span className="text-foreground/90">{nextStep ?? "Not set"}</span>
          </p>
          {dispoNote && (
            <p className="text-sm text-muted-foreground/80">
              Dispo note: <span className="text-foreground/90">{dispoNote}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground/70">
            Last updated: <span className="text-foreground/85">{updatedLabel}</span>
          </p>
        </div>
      )}
    </div>
  );
}
export type MilestoneDraft = {
  appointmentAt: string;
  offerAmount: string;
  contractAt: string;
  assignmentFeeProjected: string;
};

export function AcquisitionsMilestoneCard(props: {
  editing: boolean;
  saving: boolean;
  draft: MilestoneDraft;
  appointmentAt: string | null;
  offerAmount: number | null;
  contractAt: string | null;
  assignmentFeeProjected: number | null;
  onEditToggle: (next: boolean) => void;
  onDraftChange: (patch: Partial<MilestoneDraft>) => void;
  onSave: () => void;
}) {
  const {
    editing,
    saving,
    draft,
    appointmentAt,
    offerAmount,
    contractAt,
    assignmentFeeProjected,
    onEditToggle,
    onDraftChange,
    onSave,
  } = props;

  const hasMilestones = appointmentAt || offerAmount || contractAt || assignmentFeeProjected;

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-primary" />
        <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Acquisitions Milestones</p>
        <Badge variant="outline" className="text-xs border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        <button
          type="button"
          onClick={() => onEditToggle(!editing)}
          className="ml-auto text-sm text-primary/75 hover:text-primary transition-colors"
          disabled={saving}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground/70">
        Manually capture key acquisitions milestones to tie marketing spend to outcomes.
      </p>

      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Appointment Date</span>
              <input
                type="datetime-local"
                value={draft.appointmentAt}
                onChange={(e) => onDraftChange({ appointmentAt: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Offer Amount</span>
              <input
                type="number"
                min={0}
                step={500}
                value={draft.offerAmount}
                onChange={(e) => onDraftChange({ offerAmount: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Contract Date</span>
              <input
                type="datetime-local"
                value={draft.contractAt}
                onChange={(e) => onDraftChange({ contractAt: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Projected Fee</span>
              <input
                type="number"
                min={0}
                step={500}
                value={draft.assignmentFeeProjected}
                onChange={(e) => onDraftChange({ assignmentFeeProjected: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary/30"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-sm" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Milestones
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!hasMilestones ? (
            <div className="space-y-1.5">
              {[
                { label: "Appointment scheduled", key: "appointment" },
                { label: "Offer presented", key: "offer" },
                { label: "Contract signed", key: "contract" },
                { label: "Assignment fee projected", key: "fee" },
              ].map((step) => (
                <div key={step.key} className="flex items-center gap-2">
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0" />
                  <span className="text-sm text-muted-foreground/35">{step.label}</span>
                </div>
              ))}
              <p className="text-sm text-muted-foreground/40 pt-1">Milestones will fill in as the deal progresses</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {appointmentAt && (
                <div className="space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Appointment</p>
                  <p className="text-sm text-foreground font-medium">
                    {new Date(appointmentAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {offerAmount != null && (
                <div className="space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Offer</p>
                  <p className="text-sm text-foreground font-medium">
                    ${offerAmount.toLocaleString()}
                  </p>
                </div>
              )}
              {contractAt && (
                <div className="space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Contract</p>
                  <p className="text-sm text-foreground font-medium">
                    {new Date(contractAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {assignmentFeeProjected != null && (
                <div className="space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Projected Fee</p>
                  <p className="text-sm text-primary font-medium">
                    ${assignmentFeeProjected.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
