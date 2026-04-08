export interface BrowserVoiceStreamOptions {
  transcriptionUrl: string | undefined;
  hasDeepgram: boolean;
  callLogId: string | null;
  sessionId: string | null;
  agentId: string | null;
}

export function buildBrowserVoiceStreamLines({
  transcriptionUrl,
  hasDeepgram,
  callLogId,
  sessionId,
  agentId,
}: BrowserVoiceStreamOptions): string[] {
  if (!transcriptionUrl || !hasDeepgram || (!callLogId && !sessionId)) {
    return [];
  }

  const streamParams = new URLSearchParams();
  if (callLogId) streamParams.set("callLogId", callLogId);
  if (sessionId) streamParams.set("sessionId", sessionId);
  if (agentId) streamParams.set("userId", agentId);

  // Keep context on both the URL and the Twilio stream parameters so the
  // external transcription relay can correlate outbound browser calls.
  const streamQuery = streamParams.toString().replace(/&/g, "&amp;");
  const streamUrl = `${transcriptionUrl}${streamQuery ? `?${streamQuery}` : ""}`;

  return [
    "  <Start>",
    `    <Stream url="${streamUrl}" track="both_tracks">`,
    ...(callLogId ? [`      <Parameter name="callLogId" value="${callLogId}" />`] : []),
    ...(sessionId ? [`      <Parameter name="sessionId" value="${sessionId}" />`] : []),
    ...(agentId ? [`      <Parameter name="userId" value="${agentId}" />`] : []),
    "    </Stream>",
    "  </Start>",
  ];
}
