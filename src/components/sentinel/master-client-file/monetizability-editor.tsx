"use client";

/**
 * MonetizabilityEditor
 *
 * Adam-only: manually set monetizability_score (1-10) and dispo_friction_level
 * on a lead. Not shown to Logan. Not auto-computed.
 *
 * Per the plan: "Manual-only — Adam sets these through Lead Detail."
 * The radar's computed monetizabilityScore is read-only and not persisted.
 * This component persists Adam's reviewed/confirmed score.
 */

import { useState, useCallback } from "react";
import { Loader2, Save, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const FRICTION_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
];

interface MonetizabilityEditorProps {
  leadId: string;
  initialScore: number | null;
  initialFriction: string | null;
  onSaved?: (score: number | null, friction: string | null) => void;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export function MonetizabilityEditor({
  leadId,
  initialScore,
  initialFriction,
  onSaved,
}: MonetizabilityEditorProps) {
  const [score, setScore] = useState<string>(initialScore !== null ? String(initialScore) : "");
  const [friction, setFriction] = useState<string>(initialFriction ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleScoreChange = useCallback((v: string) => {
    setScore(v);
    setDirty(true);
  }, []);

  const handleFrictionChange = useCallback((v: string) => {
    setFriction(v);
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const parsedScore = score.trim() === "" ? null : parseInt(score.trim(), 10);
      if (parsedScore !== null && (isNaN(parsedScore) || parsedScore < 1 || parsedScore > 10)) {
        toast.error("Score must be 1–10 or blank");
        return;
      }
      const res = await window.fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          monetizability_score: parsedScore,
          dispo_friction_level: friction.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      setDirty(false);
      toast.success("Monetizability fields saved");
      onSaved?.(parsedScore, friction.trim() || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [leadId, score, friction, onSaved]);

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-3.5 w-3.5 text-cyan/60" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
          Monetizability
        </span>
        <span className="text-[9px] text-muted-foreground/40 ml-auto">Admin only</span>
      </div>

      <div className="flex items-end gap-2">
        {/* Score 1-10 */}
        <div className="space-y-1 flex-1">
          <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Score (1–10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={score}
            onChange={(e) => handleScoreChange(e.target.value)}
            placeholder="—"
            className={cn(
              "w-full px-2.5 py-1.5 rounded-[8px] text-sm bg-white/[0.04] border border-white/[0.08]",
              "text-foreground placeholder:text-muted-foreground/30",
              "focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20 transition-all",
              "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            )}
          />
        </div>

        {/* Friction level */}
        <div className="space-y-1 flex-1">
          <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Dispo Friction</label>
          <select
            value={friction}
            onChange={(e) => handleFrictionChange(e.target.value)}
            className={cn(
              "w-full px-2.5 py-1.5 rounded-[8px] text-sm bg-white/[0.04] border border-white/[0.08]",
              "text-foreground focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20 transition-all",
              friction === "" && "text-muted-foreground/40"
            )}
          >
            <option value="">— Not set</option>
            {FRICTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            "flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-[8px] font-medium transition-colors mb-0.5",
            dirty && !saving
              ? "bg-cyan/10 text-cyan/80 hover:bg-cyan/20 border border-cyan/15"
              : "bg-white/[0.03] text-muted-foreground/30 border border-white/[0.04] cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
          Save
        </button>
      </div>

      <p className="text-[9.5px] text-muted-foreground/35 leading-snug">
        Manual override. Radar computes a suggested score when 10+ active buyers exist — review it, then enter your confirmed score here.
      </p>
    </div>
  );
}
