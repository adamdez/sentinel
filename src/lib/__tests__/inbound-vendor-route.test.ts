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

  it("unwraps embedded JSON strings stored under an empty key", () => {
    const payload = {
      "": JSON.stringify({
        name: "Renae Banks",
        phone: "++1 509 389 3805",
        address: "34124 N Newport hwy trlr 29: Chattaroy, WA 99003",
        city: "Spokane",
        state: "WA",
        zip: "99003",
        message: "Living in with mom due to medical reasons",
      }),
      source_vendor: "lead_house",
    };

    expect(unwrapVendorPayload(payload)).toMatchObject({
      source_vendor: "lead_house",
      name: "Renae Banks",
      phone: "++1 509 389 3805",
      address: "34124 N Newport hwy trlr 29: Chattaroy, WA 99003",
      city: "Spokane",
      state: "WA",
      zip: "99003",
      message: "Living in with mom due to medical reasons",
    });
  });

  it("unwraps embedded JSON strings that use non-breaking spaces for indentation", () => {
    const payload = {
      "": '{\n\u00a0\u00a0"name": "Anna Macpherson",\n\u00a0\u00a0"phone": "++1 509 342 6379",\n\u00a0\u00a0"address": "5328 Rail Canyon Road",\n\u00a0\u00a0"city": "Spokane",\n\u00a0\u00a0"state": "WA",\n\u00a0\u00a0"zip": "99006",\n\u00a0\u00a0"message": "Multi-Family Home Reason for Selling: Want to retire. Selling Timeframe: Within 30 Days. Best time to Speak: Evenings"\n}',
      source_vendor: "lead_house",
    };

    expect(unwrapVendorPayload(payload)).toMatchObject({
      source_vendor: "lead_house",
      name: "Anna Macpherson",
      phone: "++1 509 342 6379",
      address: "5328 Rail Canyon Road",
      city: "Spokane",
      state: "WA",
      zip: "99006",
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

  it("builds a normalized candidate from embedded JSON strings stored under an empty key", () => {
    const candidate = buildNormalizedVendorCandidate({
      "": JSON.stringify({
        name: "Renae Banks",
        phone: "++1 509 389 3805",
        address: "34124 N Newport hwy trlr 29: Chattaroy, WA 99003",
        city: "Spokane",
        state: "WA",
        zip: "99003",
        message: "Living in with mom due to medical reasons",
      }),
    }, {
      sourceVendor: "lead_house",
      sourceChannel: "vendor_inbound",
      intakeMethod: "lead_house_webhook",
    });

    expect(candidate.ownerName).toBe("Renae Banks");
    expect(candidate.phone).toBe("5093893805");
    expect(candidate.propertyAddress).toBe("34124 N Newport hwy trlr 29: Chattaroy, WA 99003");
    expect(candidate.propertyCity).toBe("Chattaroy");
    expect(candidate.propertyState).toBe("WA");
    expect(candidate.propertyZip).toBe("99003");
  });

  it("builds a normalized candidate from Lead House payloads with non-breaking spaces", () => {
    const candidate = buildNormalizedVendorCandidate({
      "": '{\n\u00a0\u00a0"name": "Anna Macpherson",\n\u00a0\u00a0"phone": "++1 509 342 6379",\n\u00a0\u00a0"address": "5328 Rail Canyon Road",\n\u00a0\u00a0"city": "Spokane",\n\u00a0\u00a0"state": "WA",\n\u00a0\u00a0"zip": "99006",\n\u00a0\u00a0"message": "Multi-Family Home Reason for Selling: Want to retire. Selling Timeframe: Within 30 Days. Best time to Speak: Evenings"\n}',
    }, {
      sourceVendor: "lead_house",
      sourceChannel: "vendor_inbound",
      intakeMethod: "lead_house_webhook",
    });

    expect(candidate.ownerName).toBe("Anna Macpherson");
    expect(candidate.phone).toBe("5093426379");
    expect(candidate.propertyAddress).toBe("5328 Rail Canyon Road");
    expect(candidate.propertyCity).toBe("Deer Park");
    expect(candidate.propertyState).toBe("WA");
    expect(candidate.propertyZip).toBe("99006");
  });
});
