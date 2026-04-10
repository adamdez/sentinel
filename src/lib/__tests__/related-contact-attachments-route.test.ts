import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
}));

function createStorageDouble() {
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const createSignedUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://signed.example/${encodeURIComponent(path)}` },
    error: null,
  }));

  const propertiesRow = {
    owner_flags: {
      related_contacts: [
        {
          id: "contact-1",
          name: "Jane Doe",
          relation: "Daughter",
          attachments: [
            {
              id: "attachment-1",
              name: "probate.pdf",
              mime_type: "application/pdf",
              size_bytes: 1024,
              storage_path: "user-1/property-1/contact-1/attachment-1-probate.pdf",
              kind: "file",
              created_at: "2026-04-10T00:00:00.000Z",
            },
          ],
        },
      ],
    },
  };

  return {
    upload,
    remove,
    createSignedUrl,
    client: {
      storage: {
        listBuckets: vi.fn(async () => ({ data: [{ name: "related-contact-evidence" }], error: null })),
        createBucket: vi.fn(async () => ({ data: null, error: null })),
        from: vi.fn(() => ({
          upload,
          remove,
          createSignedUrl,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: propertiesRow, error: null })),
          })),
        })),
      })),
    },
  };
}

describe("related contact attachments route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
  });

  it("returns signed urls for stored related-contact attachments", async () => {
    const sb = createStorageDouble();
    mocks.createServerClient.mockReturnValue(sb.client);

    const { GET } = await import("@/app/api/properties/[propertyId]/related-contacts/attachments/route");
    const response = await GET(
      new Request("http://localhost/api/properties/property-1/related-contacts/attachments", {
        headers: { authorization: "Bearer token" },
      }) as never,
      { params: Promise.resolve({ propertyId: "property-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.attachments).toEqual([
      {
        contact_id: "contact-1",
        attachment_id: "attachment-1",
        signed_url: "https://signed.example/user-1%2Fproperty-1%2Fcontact-1%2Fattachment-1-probate.pdf",
      },
    ]);
  });

  it("uploads a file and returns attachment metadata", async () => {
    const sb = createStorageDouble();
    mocks.createServerClient.mockReturnValue(sb.client);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.set("contactId", "contact-1");
    formData.set("file", file);

    const { POST } = await import("@/app/api/properties/[propertyId]/related-contacts/attachments/route");
    const response = await POST(
      new Request("http://localhost/api/properties/property-1/related-contacts/attachments", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: formData,
      }) as never,
      { params: Promise.resolve({ propertyId: "property-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.attachment).toMatchObject({
      name: "notes.txt",
      mime_type: "text/plain",
      kind: "file",
      signed_url: expect.stringContaining("https://signed.example/"),
    });
    expect(sb.upload).toHaveBeenCalledTimes(1);
  });

  it("removes a file only when the path matches the user and property", async () => {
    const sb = createStorageDouble();
    mocks.createServerClient.mockReturnValue(sb.client);

    const { DELETE } = await import("@/app/api/properties/[propertyId]/related-contacts/attachments/route");
    const response = await DELETE(
      new Request("http://localhost/api/properties/property-1/related-contacts/attachments", {
        method: "DELETE",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          storagePath: "user-1/property-1/contact-1/attachment-1-probate.pdf",
        }),
      }) as never,
      { params: Promise.resolve({ propertyId: "property-1" }) },
    );

    expect(response.status).toBe(200);
    expect(sb.remove).toHaveBeenCalledWith(["user-1/property-1/contact-1/attachment-1-probate.pdf"]);
  });
});
