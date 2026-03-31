import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe("createDialerClient", () => {
  const originalEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockReset();
    createClientMock.mockReturnValue({ auth: { getUser: vi.fn() } });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("uses the service role key without forwarding caller auth when configured", async () => {
    const { createDialerClient } = await import("@/lib/dialer/db");

    createDialerClient("Bearer user-token");

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      expect.objectContaining({
        global: undefined,
      }),
    );
  });

  it("forwards caller auth when falling back to the anon key", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    const { createDialerClient } = await import("@/lib/dialer/db");

    createDialerClient("user-token");

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        global: {
          headers: {
            Authorization: "Bearer user-token",
          },
        },
      }),
    );
  });

  it("does not send an empty auth header in anon fallback mode", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    const { createDialerClient } = await import("@/lib/dialer/db");

    createDialerClient();

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        global: undefined,
      }),
    );
  });
});
