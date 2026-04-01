"use client";

import { useState } from "react";
import { X, PhoneOutgoing } from "lucide-react";

const DISPOSITIONS = [
  { value: "voicemail", label: "Left Voicemail" },
  { value: "no_answer", label: "No Answer" },
  { value: "interested", label: "Interested" },
  { value: "appointment", label: "Appointment Set" },
  { value: "callback", label: "Callback Requested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "dead", label: "Dead / Disconnected" },
  { value: "nurture", label: "Nurture / Follow Up" },
] as const;

const NEXT_STEPS = [
  { value: "", label: "None" },
  { value: "callback", label: "Call Back" },
  { value: "drive_by", label: "Drive By" },
] as const;

const DUE_PRESETS = [
  { value: "1", label: "Tomorrow" },
  { value: "3", label: "In 3 days" },
  { value: "7", label: "In 1 week" },
] as const;

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

interface LogCallModalProps {
  leadId: string;
  leadAddress: string;
  ownerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function LogCallModal({
  leadId,
  leadAddress,
  ownerName,
  onClose,
  onSuccess,
}: LogCallModalProps) {
  const [disposition, setDisposition] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [dueDays, setDueDays] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!disposition) {
      setError("Select a call outcome");
      return;
    }
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      disposition,
      notes: notes.trim() || undefined,
    };

    if (nextStep === "drive_by") {
      payload.next_action = "Drive by";
      payload.next_action_due_at = daysFromNowIso(parseInt(dueDays, 10));
    } else if (nextStep === "callback") {
      payload.next_action = "Call back";
      payload.next_action_due_at = daysFromNowIso(parseInt(dueDays, 10));
    }

    try {
      const res = await fetch(`/api/leads/${leadId}/log-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to log call");
        setSaving(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] border border-overlay-10 rounded-xl w-full max-w-sm p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Log External Call</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          <span className="text-foreground font-medium">{ownerName}</span>
          <span className="mx-1.5 text-muted-foreground/40">|</span>
          <span>{leadAddress}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">
              Call Outcome
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => { setDisposition(d.value); setError(null); }}
                  className={`text-sm px-2 py-1.5 rounded border transition-colors ${
                    disposition === d.value
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-overlay-3 text-muted-foreground border-overlay-8 hover:bg-overlay-6"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Quick notes from the call..."
              className="w-full bg-overlay-3 border border-overlay-8 rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none h-16 focus:outline-none focus:border-primary/30"
            />
          </div>

          <div>
            <label className="text-sm uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">
              Next Step
            </label>
            <div className="flex gap-1.5">
              {NEXT_STEPS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setNextStep(s.value)}
                  className={`text-sm px-2.5 py-1.5 rounded border transition-colors ${
                    nextStep === s.value
                      ? s.value === "drive_by"
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30 font-medium"
                        : "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "bg-overlay-3 text-muted-foreground border-overlay-8 hover:bg-overlay-6"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {nextStep && (
              <div className="flex gap-1.5 mt-2">
                {DUE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setDueDays(p.value)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      dueDays === p.value
                        ? "bg-primary/15 text-primary border-primary/30 font-medium"
                        : "bg-overlay-3 text-muted-foreground border-overlay-8 hover:bg-overlay-6"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-foreground">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !disposition}
            className="w-full py-2 rounded-md text-xs font-medium transition-colors bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Log Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
