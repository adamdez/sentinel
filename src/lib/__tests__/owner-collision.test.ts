import { describe, expect, it } from "vitest";

import {
  buildOwnerCollisionKey,
  filterRelatedOwnerLeads,
  normalizeOwnerCollisionName,
  ownerCollisionLabel,
  type RelatedOwnerLeadSummary,
} from "@/lib/owner-collision";

describe("owner collision helpers", () => {
  it("normalizes punctuation and spacing in owner names", () => {
    expect(normalizeOwnerCollisionName("AULT,ROGER R")).toBe("ault roger r");
    expect(normalizeOwnerCollisionName(" AULT, ROGER   R ")).toBe("ault roger r");
  });

  it("builds the same collision key for common owner-name variants", () => {
    expect(buildOwnerCollisionKey("AULT,ROGER R")).toBe("ault roger");
    expect(buildOwnerCollisionKey("AULT, ROGER R")).toBe("ault roger");
    expect(buildOwnerCollisionKey("AULT,ROGER")).toBe("ault roger");
  });

  it("filters out the current property and lead while preserving other files", () => {
    const leads: RelatedOwnerLeadSummary[] = [
      {
        leadId: "lead-1",
        propertyId: "property-1",
        ownerName: "AULT,ROGER R",
        address: "1808 N SMITH ST",
        city: "Spokane",
        state: "WA",
        zip: "99207",
        phone: "5098386666",
        status: "lead",
        priority: 43,
      },
      {
        leadId: "lead-2",
        propertyId: "property-2",
        ownerName: "AULT,ROGER",
        address: "4235 E 29TH AVE",
        city: "Spokane",
        state: "WA",
        zip: "99223",
        phone: "5098386666",
        status: "nurture",
        priority: 12,
      },
      {
        leadId: "lead-3",
        propertyId: "property-3",
        ownerName: "AULT, ROGER R",
        address: "1103 E 29TH AVE",
        city: "Spokane",
        state: "WA",
        zip: "99203",
        phone: "5098386666",
        status: "prospect",
        priority: 3,
      },
    ];

    expect(
      filterRelatedOwnerLeads(leads, {
        excludeLeadId: "lead-1",
        excludePropertyId: "property-1",
      }).map((lead) => lead.leadId),
    ).toEqual(["lead-2", "lead-3"]);
  });

  it("builds a confidence-friendly label", () => {
    expect(ownerCollisionLabel(1)).toBe("Possible same owner on 1 other file");
    expect(ownerCollisionLabel(3)).toBe("Possible same owner on 3 other files");
  });
});
