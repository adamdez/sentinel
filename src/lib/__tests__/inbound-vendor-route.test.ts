import { describe, expect, it } from "vitest";
import { unwrapVendorPayload } from "@/lib/inbound-vendor-payload";

describe("unwrapVendorPayload", () => {
  it("keeps flat vendor payloads unchanged", () => {
    const payload = {
      source_vendor: "lead_house",
      name: "Flat Lead",
      phone: "+13214567890",
      address: "123 Main St",
    };

    expect(unwrapVendorPayload(payload)).toEqual(payload);
  });

  it("unwraps nested LEAD INFO payloads from Zapier data blocks", () => {
    const payload = {
      source_vendor: "lead_house",
      data: {
        "LEAD INFO": {
          name: "Nested Lead",
          phone: "+13214567890",
          address: "4705 North Fruit Hill Road",
          zip: "99217",
          message: "TIMELINE: ASAP",
        },
      },
    };

    expect(unwrapVendorPayload(payload)).toMatchObject({
      source_vendor: "lead_house",
      name: "Nested Lead",
      phone: "+13214567890",
      address: "4705 North Fruit Hill Road",
      zip: "99217",
      message: "TIMELINE: ASAP",
    });
  });

  it("prefers nested lead fields while preserving top-level vendor metadata", () => {
    const payload = {
      source_vendor: "lead_house",
      source_channel: "vendor_inbound",
      data: {
        campaign: "Test Funnel",
      },
      "LEAD INFO": {
        name: "Lead House Test",
        phone: "+13214567890",
      },
    };

    expect(unwrapVendorPayload(payload)).toMatchObject({
      source_vendor: "lead_house",
      source_channel: "vendor_inbound",
      campaign: "Test Funnel",
      name: "Lead House Test",
      phone: "+13214567890",
    });
  });
});
