import { describe, expect, it } from "vitest";
import { unwrapVendorPayload } from "@/lib/inbound-vendor-payload";
import { buildNormalizedVendorCandidate } from "@/lib/inbound-vendor-route";

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
});

describe("buildNormalizedVendorCandidate", () => {
  it("builds a normalized candidate from nested Lead House payloads", () => {
    const candidate = buildNormalizedVendorCandidate({
      data: {
        "LEAD INFO": {
          name: "Lead House Test",
          phone: "+1 321 456 7890",
          address: "4705 North Fruit Hill Road",
          city: "Spokane",
          state: "WA",
          zip: "99217",
          message: "TIMELINE: ASAP",
        },
      },
    }, {
      sourceVendor: "lead_house",
      sourceChannel: "vendor_inbound",
      intakeMethod: "lead_house_webhook",
    });

    expect(candidate.ownerName).toBe("Lead House Test");
    expect(candidate.phone).toBe("3214567890");
    expect(candidate.propertyAddress).toBe("4705 North Fruit Hill Road");
    expect(candidate.propertyCity).toBe("Spokane");
    expect(candidate.propertyState).toBe("WA");
    expect(candidate.propertyZip).toBe("99217");
    expect(candidate.sourceVendor).toBe("lead_house");
    expect(candidate.sourceChannel).toBe("vendor_inbound");
    expect(candidate.intakeMethod).toBe("lead_house_webhook");
  });

  it("preserves top-level vendor metadata when nested lead info is present", () => {
    const candidate = buildNormalizedVendorCandidate({
      source_campaign: "Test Funnel",
      data: {
        "LEAD INFO": {
          name: "Lead House Test",
          phone: "+1 321 456 7890",
          address: "4705 North Fruit Hill Road",
        },
      },
    }, {
      sourceVendor: "lead_house",
      sourceChannel: "vendor_inbound",
    });

    expect(candidate.sourceCampaign).toBe("Test Funnel");
    expect(candidate.sourceVendor).toBe("lead_house");
    expect(candidate.sourceChannel).toBe("vendor_inbound");
  });
});
