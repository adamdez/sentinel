"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  Loader2,
  Mic,
  PhoneCall,
  Play,
  Save,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  BUSINESS_DAYS,
  DEFAULT_VOICE_CONTROL_CONFIG,
  getBusinessHoursStatus,
  normalizeVoiceControlConfig,
  type BusinessDay,
  type VoiceControlConfig,
} from "@/lib/voice-control";

const DAY_LABELS: Record<BusinessDay, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const TTS_VOICES = [
  "Polly.Joanna",
  "Polly.Matthew",
  "Polly.Amy",
  "Polly.Justin",
  "Polly.Kendra",
];

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expired");
  return { Authorization: `Bearer ${session.access_token}` };
}

export default function VoiceControlAdminPage() {
  const [config, setConfig] = useState<VoiceControlConfig>(DEFAULT_VOICE_CONTROL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAudio, setDeletingAudio] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const liveHours = useMemo(() => getBusinessHoursStatus(config.businessHours), [config.businessHours]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/voice-control", { headers, cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load voice control");
      setConfig(normalizeVoiceControlConfig(body.config));
      setAudioPreviewUrl(body.audioPreviewUrl ? `${body.audioPreviewUrl}?t=${Date.now()}` : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load voice control");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDay = useCallback((day: BusinessDay, patch: Partial<VoiceControlConfig["businessHours"][BusinessDay]>) => {
    setConfig((current) => ({
      ...current,
      businessHours: {
        ...current.businessHours,
        [day]: {
          ...current.businessHours[day],
          ...patch,
        },
      },
    }));
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/voice-control", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save voice control");
      setConfig(normalizeVoiceControlConfig(body.config));
      setAudioPreviewUrl(body.audioPreviewUrl ? `${body.audioPreviewUrl}?t=${Date.now()}` : null);
      toast.success("Voice control saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save voice control");
    } finally {
      setSaving(false);
    }
  }, [config]);

  const uploadAudio = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/voice-control", {
        method: "POST",
        headers,
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to upload voicemail audio");
      setConfig(normalizeVoiceControlConfig(body.config));
      setAudioPreviewUrl(body.audioPreviewUrl ? `${body.audioPreviewUrl}?t=${Date.now()}` : null);
      toast.success("Voicemail audio uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload voicemail audio");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const deleteAudio = useCallback(async () => {
    setDeletingAudio(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/voice-control", {
        method: "DELETE",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to delete voicemail audio");
      setConfig(normalizeVoiceControlConfig(body.config));
      setAudioPreviewUrl(null);
      toast.success("Uploaded voicemail audio deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete voicemail audio");
    } finally {
      setDeletingAudio(false);
    }
  }, []);

  return (
    <PageShell title="Voice Control" description="Admin control for live office hours and voicemail behavior.">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground/70 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-border/30 bg-muted/10 text-foreground/80">
              {liveHours.isOpen ? "Office Open" : `Closed · next ${liveHours.nextOpenTime}`}
            </Badge>
            <Button onClick={() => void saveConfig()} disabled={saving || loading} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Live Settings
            </Button>
          </div>
        </div>

        {loading ? (
          <GlassCard hover={false} className="!p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading voice control…
            </div>
          </GlassCard>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <GlassCard hover={false} className="!p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Voicemail Greeting</h2>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                    Text-To-Speech Greeting
                  </label>
                  <Textarea
                    value={config.voicemailGreeting}
                    onChange={(event) => setConfig((current) => ({ ...current, voicemailGreeting: event.target.value }))}
                    rows={4}
                    className="bg-overlay-2 border-overlay-8"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                      No-Voicemail Followup
                    </label>
                    <Textarea
                      value={config.noVoicemailMessage}
                      onChange={(event) => setConfig((current) => ({ ...current, noVoicemailMessage: event.target.value }))}
                      rows={3}
                      className="bg-overlay-2 border-overlay-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                      Twilio Voice
                    </label>
                    <select
                      value={config.ttsVoice}
                      onChange={(event) => setConfig((current) => ({ ...current, ttsVoice: event.target.value }))}
                      className="h-10 w-full rounded-md border border-overlay-8 bg-overlay-2 px-3 text-sm text-foreground"
                    >
                      {TTS_VOICES.map((voice) => (
                        <option key={voice} value={voice}>{voice}</option>
                      ))}
                    </select>

                    <div className="flex items-center justify-between rounded-xl border border-overlay-8 bg-overlay-2 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">Use uploaded audio</p>
                        <p className="text-xs text-muted-foreground/60">
                          When enabled, Twilio plays your uploaded recording instead of TTS.
                        </p>
                      </div>
                      <Switch
                        checked={config.useUploadedGreeting}
                        onCheckedChange={(checked) => setConfig((current) => ({ ...current, useUploadedGreeting: checked }))}
                        disabled={!config.uploadedGreeting}
                      />
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard hover={false} className="!p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Uploaded Greeting Audio</h2>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAudio(file);
                  }}
                />

                <div className="rounded-xl border border-overlay-8 bg-overlay-2 px-4 py-3">
                  {config.uploadedGreeting ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{config.uploadedGreeting.fileName}</p>
                        <p className="text-xs text-muted-foreground/60">
                          Uploaded {new Date(config.uploadedGreeting.uploadedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                        </p>
                      </div>
                      {audioPreviewUrl && (
                        <audio controls preload="none" className="w-full" src={audioPreviewUrl}>
                          Your browser does not support audio preview.
                        </audio>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/60">
                      No uploaded greeting yet. Twilio will use the TTS message until you upload audio.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Upload Audio
                  </Button>
                  <Button type="button" variant="outline" disabled={!audioPreviewUrl} asChild>
                    <a href={audioPreviewUrl ?? "#"} target="_blank" rel="noreferrer">
                      <Play className="mr-2 h-4 w-4" />
                      Open Preview
                    </a>
                  </Button>
                  <Button type="button" variant="outline" disabled={!config.uploadedGreeting || deletingAudio} onClick={() => void deleteAudio()}>
                    {deletingAudio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Delete Audio
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground/55">
                  Recommended: short `mp3` or `wav`, under 15 MB, clear opening prompt, then let Twilio record the caller.
                </p>
              </GlassCard>
            </div>

            <GlassCard hover={false} className="!p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Office Hours</h2>
              </div>

              <div className="grid gap-3">
                {BUSINESS_DAYS.map((day) => (
                  <div key={day} className="grid items-center gap-3 rounded-xl border border-overlay-8 bg-overlay-2 px-4 py-3 md:grid-cols-[90px_120px_1fr_1fr]">
                    <div className="text-sm font-medium text-foreground">{DAY_LABELS[day]}</div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.businessHours[day].enabled}
                        onCheckedChange={(checked) => updateDay(day, { enabled: checked })}
                      />
                      <span className="text-xs text-muted-foreground/65">
                        {config.businessHours[day].enabled ? "Open" : "Closed"}
                      </span>
                    </div>
                    <Input
                      type="time"
                      value={config.businessHours[day].start}
                      disabled={!config.businessHours[day].enabled}
                      onChange={(event) => updateDay(day, { start: event.target.value })}
                      className="bg-overlay-1 border-overlay-8"
                    />
                    <Input
                      type="time"
                      value={config.businessHours[day].end}
                      disabled={!config.businessHours[day].enabled}
                      onChange={(event) => updateDay(day, { end: event.target.value })}
                      className="bg-overlay-1 border-overlay-8"
                    />
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard hover={false} className="!p-5">
              <div className="flex items-start gap-3">
                <PhoneCall className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">What this controls live</p>
                  <p className="mt-1 text-sm text-muted-foreground/65">
                    The Twilio inbound webhook, after-hours voicemail behavior, and Jeff outbound business-hours gating all read from this control surface.
                  </p>
                </div>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </PageShell>
  );
}
