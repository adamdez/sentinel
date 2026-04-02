import { describe, expect, it } from "vitest";
import { primaryItems, toolsSection } from "@/components/layout/sidebar-config";

describe("sidebar navigation", () => {
  it("keeps PPL Inbox in the primary navigation between Lead Queue and Dialer", () => {
    const labels = primaryItems.map((item) => item.label);

    expect(labels).toContain("PPL Inbox");
    expect(labels.indexOf("Lead Queue")).toBeLessThan(labels.indexOf("PPL Inbox"));
    expect(labels.indexOf("PPL Inbox")).toBeLessThan(labels.indexOf("Dialer"));
  });

  it("does not duplicate PPL Inbox inside the tools section", () => {
    const toolLabels = toolsSection.items.map((item) => item.label);

    expect(toolLabels).not.toContain("PPL Inbox");
  });
});
