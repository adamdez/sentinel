"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BuyerFitVisibility, DispoReadinessVisibility, OfferStatusTruth } from "@/lib/leads-data";
import { Loader2, Save, Target, Users } from "lucide-react";

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

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-cyan" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Offer Status</p>
        <Badge variant="outline" className="text-[9px] border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditToggle(!editing)}
            className="ml-auto text-[10px] text-cyan/75 hover:text-cyan transition-colors"
            disabled={saving}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Operator-entered seller response snapshot. This is not a full offer workflow engine.
      </p>
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Status</span>
              <select
                value={draft.status}
                onChange={(e) => onDraftChange({ status: (e.target.value as OfferStatusTruth | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              >
                <option value="">Not set</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Offer Amount (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amount}
                onChange={(e) => onDraftChange({ amount: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Offer Range Low (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amountLow}
                onChange={(e) => onDraftChange({ amountLow: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Offer Range High (optional)</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={draft.amountHigh}
                onChange={(e) => onDraftChange({ amountHigh: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Seller Response Note (optional)</span>
            <textarea
              value={draft.sellerResponseNote}
              onChange={(e) => onDraftChange({ sellerResponseNote: e.target.value })}
              rows={2}
              placeholder="Seller reaction, objection, or revision context..."
              className="w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-cyan/30"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground/65">
              Last updated: <span className="text-foreground/85">{updatedLabel}</span>
            </p>
            <Button size="sm" className="h-7 text-[11px]" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Offer Status
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", statusToneClass)}>
              {statusLabel}
            </span>
            <span className="text-[10px] text-muted-foreground/75">Amount/Range: <span className="text-foreground font-medium">{amountLabel}</span></span>
          </div>
          {sellerResponseNote && (
            <p className="text-[10px] text-muted-foreground/80">
              Seller response: <span className="text-foreground/90">{sellerResponseNote}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70">
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

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-cyan" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Buyer / Dispo Visibility</p>
        <Badge variant="outline" className="text-[9px] border-white/[0.14] text-muted-foreground">Derived</Badge>
        {(actionMissing || actionStale) && (
          <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-300">
            Action Needed
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", buyerFitToneClass)}>
          Buyer Fit: {buyerFitLabel}
        </span>
        <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", dispoReadinessToneClass)}>
          Dispo Readiness: {dispoReadinessLabel}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/70">{hint}</p>
      <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 space-y-1.5">
        <p className="text-[10px] text-foreground/90">
          Next step: <span className="font-medium">{nextStep}</span>
        </p>
        {readinessHigh && (
          <p className="text-[10px] text-muted-foreground/80">
            Buyer/dispo follow-up: <span className="text-foreground font-medium">{nextActionLabel}</span>
          </p>
        )}
        {(actionMissing || actionStale) && (
          <p className="text-[10px] text-amber-300">
            {actionMissing
              ? "Buyer/dispo readiness is high, but no next action is set."
              : "Buyer/dispo readiness is high, and next action is overdue."}
            {" "}Use <span className="font-semibold">Set Next Action</span> to keep this path active.
          </p>
        )}
      </div>
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
        <Users className="h-3.5 w-3.5 text-cyan" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Buyer / Dispo Truth</p>
        <Badge variant="outline" className="text-[9px] border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEditToggle(!editing)}
            className="ml-auto text-[10px] text-cyan/75 hover:text-cyan transition-colors"
            disabled={saving}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Derived visibility above is a signal. This section is your operator-entered downstream truth.
      </p>
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Buyer Fit</span>
              <select
                value={draft.buyerFit}
                onChange={(e) => onDraftChange({ buyerFit: (e.target.value as BuyerFitVisibility | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              >
                <option value="">Not set</option>
                <option value="broad">Broad</option>
                <option value="narrow">Narrow</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Dispo Status</span>
              <select
                value={draft.dispoStatus}
                onChange={(e) => onDraftChange({ dispoStatus: (e.target.value as DispoReadinessVisibility | "") })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              >
                <option value="">Not set</option>
                <option value="not_ready">Not Ready</option>
                <option value="needs_review">Needs Review</option>
                <option value="ready">Ready</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Next Dispo Step (optional)</span>
            <input
              type="text"
              value={draft.nextStep}
              onChange={(e) => onDraftChange({ nextStep: e.target.value })}
              placeholder="Example: Review with Adam and prep buyer handoff notes"
              className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-cyan/30"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Dispo Note (optional)</span>
            <textarea
              value={draft.dispoNote}
              onChange={(e) => onDraftChange({ dispoNote: e.target.value })}
              rows={2}
              placeholder="Buyer-fit caveats, seller expectations, or handoff notes..."
              className="w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/55 focus:outline-none focus:border-cyan/30"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground/65">
              Last updated: <span className="text-foreground/85">{updatedLabel}</span>
            </p>
            <Button size="sm" className="h-7 text-[11px]" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Buyer/Dispo Truth
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", buyerFitToneClass)}>
              Buyer Fit: {buyerFitLabel}
            </span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", dispoStatusToneClass)}>
              Dispo Status: {dispoStatusLabel}
            </span>
            <span className="text-[10px] text-muted-foreground/75">{readyLabel}</span>
          </div>
          <p className="text-[10px] text-muted-foreground/80">
            Next step: <span className="text-foreground/90">{nextStep ?? "Not set"}</span>
          </p>
          {dispoNote && (
            <p className="text-[10px] text-muted-foreground/80">
              Dispo note: <span className="text-foreground/90">{dispoNote}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/70">
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
        <Target className="h-3.5 w-3.5 text-cyan" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Acquisitions Milestones</p>
        <Badge variant="outline" className="text-[9px] border-white/[0.14] text-muted-foreground">Operator entered</Badge>
        <button
          type="button"
          onClick={() => onEditToggle(!editing)}
          className="ml-auto text-[10px] text-cyan/75 hover:text-cyan transition-colors"
          disabled={saving}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        Manually capture key acquisitions milestones to tie marketing spend to outcomes.
      </p>

      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Appointment Date</span>
              <input
                type="datetime-local"
                value={draft.appointmentAt}
                onChange={(e) => onDraftChange({ appointmentAt: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Offer Amount</span>
              <input
                type="number"
                min={0}
                step={500}
                value={draft.offerAmount}
                onChange={(e) => onDraftChange({ offerAmount: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Contract Date</span>
              <input
                type="datetime-local"
                value={draft.contractAt}
                onChange={(e) => onDraftChange({ contractAt: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Projected Fee</span>
              <input
                type="number"
                min={0}
                step={500}
                value={draft.assignmentFeeProjected}
                onChange={(e) => onDraftChange({ assignmentFeeProjected: e.target.value })}
                className="h-8 w-full rounded-[8px] border border-white/[0.12] bg-white/[0.04] px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan/30"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-[11px]" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save Milestones
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!hasMilestones ? (
            <p className="text-[10px] text-muted-foreground/50 italic">No milestones captured yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {appointmentAt && (
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Appointment</p>
                  <p className="text-[10px] text-foreground font-medium">
                    {new Date(appointmentAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {offerAmount != null && (
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Offer</p>
                  <p className="text-[10px] text-emerald-400 font-medium">
                    ${offerAmount.toLocaleString()}
                  </p>
                </div>
              )}
              {contractAt && (
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Contract</p>
                  <p className="text-[10px] text-foreground font-medium">
                    {new Date(contractAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {assignmentFeeProjected != null && (
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Projected Fee</p>
                  <p className="text-[10px] text-cyan font-medium">
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
