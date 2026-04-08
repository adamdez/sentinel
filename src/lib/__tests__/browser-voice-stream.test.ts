import { describe, expect, it } from "vitest";
import { buildBrowserVoiceStreamLines } from "@/lib/twilio-browser-stream";

describe("buildBrowserVoiceStreamLines", () => {
  it("threads outbound browser stream context through the websocket URL", () => {
    const lines = buildBrowserVoiceStreamLines({
      transcriptionUrl: "wss://relay.example.com/media-stream",
      hasDeepgram: true,
      callLogId: "call-123",
      sessionId: "session-456",
      agentId: "user-789",
    });

    const xml = lines.join("\n");
    expect(xml).toContain(
      '<Stream url="wss://relay.example.com/media-stream?callLogId=call-123&amp;sessionId=session-456&amp;userId=user-789" track="both_tracks">',
    );
    expect(xml).toContain('<Parameter name="callLogId" value="call-123" />');
    expect(xml).toContain('<Parameter name="sessionId" value="session-456" />');
    expect(xml).toContain('<Parameter name="userId" value="user-789" />');
  });

  it("returns no stream when transcription is unavailable", () => {
    const lines = buildBrowserVoiceStreamLines({
      transcriptionUrl: undefined,
      hasDeepgram: true,
      callLogId: "call-123",
      sessionId: "session-456",
      agentId: "user-789",
    });

    expect(lines).toEqual([]);
  });
});
