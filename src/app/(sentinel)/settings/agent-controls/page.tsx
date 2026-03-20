"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Switch } from "@/components/ui/switch";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";

type FlagMode = "off" | "shadow" | "review_required" | "auto";

interface FeatureFlagRow {
  id: string;
  flag_key: string;
  enabled: boolean;
  mode: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

const MODE_OPTIONS: FlagMode[] = ["off", "shadow", "review_required", "auto"];

async function fetchFlags(): Promise<FeatureFlagRow[]> {
  const res = await fetch("/api/control-plane/feature-flags", {
    headers: await sentinelAuthHeaders(false),
  });
  if (!res.ok) throw new Error("Failed to load feature flags");
  const json = (await res.json()) as { data?: FeatureFlagRow[] };
  return json.data ?? [];
}

export default function AgentControlsPage() {
  const qc = useQueryClient();
  const { data: flags = [], isLoading, error } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
  });

  const patchMutation = useMutation({
    mutationFn: async (body: { flag_key: string; enabled?: boolean; mode?: string }) => {
      const res = await fetch("/api/control-plane/feature-flags", {
        method: "PATCH",
        headers: await sentinelAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
      return json as { data: FeatureFlagRow };
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["feature-flags"] });
      const prev = qc.getQueryData<FeatureFlagRow[]>(["feature-flags"]);
      if (prev) {
        qc.setQueryData<FeatureFlagRow[]>(
          ["feature-flags"],
          prev.map((f) =>
            f.flag_key === vars.flag_key
              ? {
                  ...f,
                  ...(typeof vars.enabled === "boolean" ? { enabled: vars.enabled } : {}),
                  ...(vars.mode != null ? { mode: vars.mode } : {}),
                }
              : f,
          ),
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["feature-flags"], ctx.prev);
      toast.error(err instanceof Error ? err.message : "Update failed");
    },
    onSuccess: (res) => {
      qc.setQueryData<FeatureFlagRow[]>(["feature-flags"], (old) => {
        if (!old) return [res.data];
        return old.map((f) => (f.flag_key === res.data.flag_key ? res.data : f));
      });
    },
  });

  const agentFlags = flags.filter((f) => f.flag_key.startsWith("agent."));
  const voiceFlags = flags.filter((f) => f.flag_key.startsWith("voice."));
  const otherFlags = flags.filter((f) => !f.flag_key.startsWith("agent.") && !f.flag_key.startsWith("voice."));

  return (
    <PageShell
      title="Agent controls"
      description="Feature flags for agents and voice workflows. Changes apply immediately."
    >
      <div className="mb-4">
        <Link
          href="/settings"
          className="text-[11px] text-muted-foreground hover:text-cyan transition-colors"
        >
          ← Back to settings
        </Link>
      </div>

      {isLoading && (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading flags…
        </GlassCard>
      )}

      {error && !isLoading && (
        <GlassCard hover={false} className="border-red-500/20 text-sm text-red-400">
          {(error as Error).message}
        </GlassCard>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          <FlagSection
            title="Agent flags"
            subtitle="Research, follow-up, QA, dispo, ads monitor, exception scan"
            rows={agentFlags}
            onToggle={(flag_key, enabled) => patchMutation.mutate({ flag_key, enabled })}
            onMode={(flag_key, mode) => patchMutation.mutate({ flag_key, mode })}
            busyKey={patchMutation.isPending ? patchMutation.variables?.flag_key ?? null : null}
          />
          <FlagSection
            title="Voice flags"
            subtitle="Inbound AI and voice experiments"
            rows={voiceFlags}
            onToggle={(flag_key, enabled) => patchMutation.mutate({ flag_key, enabled })}
            onMode={(flag_key, mode) => patchMutation.mutate({ flag_key, mode })}
            busyKey={patchMutation.isPending ? patchMutation.variables?.flag_key ?? null : null}
          />
          {otherFlags.length > 0 && (
            <FlagSection
              title="Other flags"
              subtitle="Additional control-plane keys"
              rows={otherFlags}
              onToggle={(flag_key, enabled) => patchMutation.mutate({ flag_key, enabled })}
              onMode={(flag_key, mode) => patchMutation.mutate({ flag_key, mode })}
              busyKey={patchMutation.isPending ? patchMutation.variables?.flag_key ?? null : null}
            />
          )}
        </div>
      )}
    </PageShell>
  );
}

function FlagSection({
  title,
  subtitle,
  rows,
  onToggle,
  onMode,
  busyKey,
}: {
  title: string;
  subtitle: string;
  rows: FeatureFlagRow[];
  onToggle: (flag_key: string, enabled: boolean) => void;
  onMode: (flag_key: string, mode: string) => void;
  busyKey: string | null | undefined;
}) {
  return (
    <GlassCard hover={false}>
      <div className="flex items-start gap-2 mb-4">
        <SlidersHorizontal className="h-4 w-4 text-cyan shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-foreground/70">{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/50">No flags in this group yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-3 py-2 font-medium text-muted-foreground">Flag key</th>
                <th className="px-3 py-2 font-medium text-muted-foreground w-[100px]">Enabled</th>
                <th className="px-3 py-2 font-medium text-muted-foreground w-[160px]">Mode</th>
                <th className="px-3 py-2 font-medium text-muted-foreground min-w-[200px]">Description</th>
                <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-3 py-2 font-mono text-[10px] text-cyan/90">{row.flag_key}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.enabled}
                        disabled={busyKey === row.flag_key}
                        onCheckedChange={(v) => onToggle(row.flag_key, v)}
                      />
                      {busyKey === row.flag_key ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.mode || "off"}
                      disabled={busyKey === row.flag_key}
                      onChange={(e) => onMode(row.flag_key, e.target.value)}
                      className={cn(
                        "w-full rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[10px]",
                        "text-foreground focus:outline-none focus:ring-1 focus:ring-cyan/30",
                      )}
                    >
                      {[...new Set([...MODE_OPTIONS, row.mode as FlagMode].filter(Boolean))].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/80 max-w-md">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/50 whitespace-nowrap">
                    {row.updated_at
                      ? new Date(row.updated_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
