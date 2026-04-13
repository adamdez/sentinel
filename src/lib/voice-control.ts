export const VOICE_CONTROL_WORKFLOW = "inbound_voicemail_control";
export const VOICE_CONTROL_VERSION = "live";
export const VOICE_CONTROL_BUCKET = "voice-control-assets";
export const VOICE_CONTROL_AUDIO_ROUTE = "/api/twilio/voicemail-greeting";
export const VOICE_CONTROL_FALLBACK_TTS_VOICE = "Polly.Joanna";

export const BUSINESS_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type BusinessDay = typeof BUSINESS_DAYS[number];

export type BusinessHoursWindow = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WeeklyBusinessHours = Record<BusinessDay, BusinessHoursWindow>;

export type VoiceControlAudioAsset = {
  storagePath: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
};

export type VoiceControlConfig = {
  businessHours: WeeklyBusinessHours;
  voicemailGreeting: string;
  noVoicemailMessage: string;
  ttsVoice: string;
  useUploadedGreeting: boolean;
  uploadedGreeting: VoiceControlAudioAsset | null;
};

export type BusinessHoursStatus = {
  isOpen: boolean;
  nextOpenTime: string;
};

export const DEFAULT_VOICE_CONTROL_CONFIG: VoiceControlConfig = {
  businessHours: {
    monday: { enabled: true, start: "07:00", end: "20:30" },
    tuesday: { enabled: true, start: "07:00", end: "20:30" },
    wednesday: { enabled: true, start: "07:00", end: "20:30" },
    thursday: { enabled: true, start: "07:00", end: "20:30" },
    friday: { enabled: true, start: "07:00", end: "20:30" },
    saturday: { enabled: true, start: "07:00", end: "20:30" },
    sunday: { enabled: true, start: "13:00", end: "17:00" },
  },
  voicemailGreeting:
    "We missed your call. Please leave your name, number, and a short message after the tone, and we will call you back as soon as possible.",
  noVoicemailMessage: "We did not receive a voicemail. Goodbye.",
  ttsVoice: VOICE_CONTROL_FALLBACK_TTS_VOICE,
  useUploadedGreeting: false,
  uploadedGreeting: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeWindow(value: unknown, fallback: BusinessHoursWindow): BusinessHoursWindow {
  if (!isRecord(value)) return fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    start: normalizeTime(value.start, fallback.start),
    end: normalizeTime(value.end, fallback.end),
  };
}

function normalizeUploadedGreeting(value: unknown): VoiceControlAudioAsset | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.storagePath !== "string" ||
    typeof value.fileName !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.uploadedAt !== "string"
  ) {
    return null;
  }

  return {
    storagePath: value.storagePath,
    fileName: value.fileName,
    mimeType: value.mimeType,
    uploadedAt: value.uploadedAt,
  };
}

export function normalizeVoiceControlConfig(value: unknown): VoiceControlConfig {
  const record = isRecord(value) ? value : {};
  const rawHours = isRecord(record.businessHours) ? record.businessHours : {};

  const businessHours = BUSINESS_DAYS.reduce((acc, day) => {
    acc[day] = normalizeWindow(rawHours[day], DEFAULT_VOICE_CONTROL_CONFIG.businessHours[day]);
    return acc;
  }, {} as WeeklyBusinessHours);

  const uploadedGreeting = normalizeUploadedGreeting(record.uploadedGreeting);
  const ttsVoice = typeof record.ttsVoice === "string" && record.ttsVoice.trim()
    ? record.ttsVoice.trim()
    : DEFAULT_VOICE_CONTROL_CONFIG.ttsVoice;

  return {
    businessHours,
    voicemailGreeting:
      typeof record.voicemailGreeting === "string" && record.voicemailGreeting.trim()
        ? record.voicemailGreeting.trim()
        : DEFAULT_VOICE_CONTROL_CONFIG.voicemailGreeting,
    noVoicemailMessage:
      typeof record.noVoicemailMessage === "string" && record.noVoicemailMessage.trim()
        ? record.noVoicemailMessage.trim()
        : DEFAULT_VOICE_CONTROL_CONFIG.noVoicemailMessage,
    ttsVoice,
    useUploadedGreeting: Boolean(record.useUploadedGreeting) && !!uploadedGreeting,
    uploadedGreeting,
  };
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => parseInt(part, 10));
  return hours * 60 + minutes;
}

function formatOpenLabel(day: BusinessDay, start: string, isToday: boolean): string {
  const [hourRaw, minuteRaw] = start.split(":").map((part) => parseInt(part, 10));
  const suffix = hourRaw >= 12 ? "pm" : "am";
  const hour12 = hourRaw % 12 === 0 ? 12 : hourRaw % 12;
  const minuteText = minuteRaw === 0 ? "" : `:${String(minuteRaw).padStart(2, "0")}`;
  const dayLabel = isToday ? "today" : day.charAt(0).toUpperCase() + day.slice(1);
  return `${dayLabel} at ${hour12}${minuteText}${suffix}`;
}

export function getBusinessHoursStatus(
  schedule: WeeklyBusinessHours,
  now = new Date(),
  timeZone = "America/Los_Angeles",
): BusinessHoursStatus {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = (parts.find((part) => part.type === "weekday")?.value ?? "").toLowerCase() as BusinessDay;
  const hour = parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);
  const nowMinutes = hour * 60 + minute;

  const today = schedule[weekday];
  if (today?.enabled) {
    const startMinutes = timeToMinutes(today.start);
    const endMinutes = timeToMinutes(today.end);
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      return { isOpen: true, nextOpenTime: "" };
    }
    if (nowMinutes < startMinutes) {
      return { isOpen: false, nextOpenTime: formatOpenLabel(weekday, today.start, true) };
    }
  }

  const todayIndex = BUSINESS_DAYS.indexOf(weekday);
  for (let offset = 1; offset <= BUSINESS_DAYS.length; offset += 1) {
    const nextDay = BUSINESS_DAYS[(todayIndex + offset) % BUSINESS_DAYS.length];
    const window = schedule[nextDay];
    if (!window?.enabled) continue;
    return {
      isOpen: false,
      nextOpenTime: formatOpenLabel(nextDay, window.start, false),
    };
  }

  return { isOpen: false, nextOpenTime: "during the next business window" };
}

export async function getVoiceControlConfig(
  sb?: {
    from: (table: string) => {
      select: (query: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              eq: (column: string, value: string) => {
                maybeSingle: () => Promise<{ data: { rule_config?: unknown } | null; error?: unknown }>;
              };
            };
          };
        };
      };
    };
  },
): Promise<VoiceControlConfig> {
  const client = sb ?? (await import("@/lib/supabase")).createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.from("voice_registry") as any)
    .select("rule_config")
    .eq("workflow", VOICE_CONTROL_WORKFLOW)
    .eq("registry_type", "handoff_rule")
    .eq("status", "active")
    .eq("version", VOICE_CONTROL_VERSION)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_VOICE_CONTROL_CONFIG;
  }

  return normalizeVoiceControlConfig(data.rule_config);
}
