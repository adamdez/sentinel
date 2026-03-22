/**
 * Add Lead Entry Point Tests
 *
 * Validates that the "Add Lead" button contract is correct:
 * 1. The modal trigger ID "new-prospect" is a valid ModalType
 * 2. The modal component recognizes the trigger
 * 3. Operator-facing copy uses "Lead" not "Prospect"
 * 4. Multiple trigger points can coexist safely
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Modal Type Contract ─────────────────────────────────────────────

describe("modal provider contract", () => {
  it("'new-prospect' is a valid modal type in the provider", () => {
    const providerSrc = fs.readFileSync(
      path.resolve("src/providers/modal-provider.tsx"),
      "utf-8",
    );
    // The ModalType union must include "new-prospect"
    expect(providerSrc).toContain('"new-prospect"');
  });

  it("modal component checks for 'new-prospect' active modal", () => {
    const modalSrc = fs.readFileSync(
      path.resolve("src/components/sentinel/new-prospect-modal.tsx"),
      "utf-8",
    );
    expect(modalSrc).toContain('activeModal === "new-prospect"');
  });
});

// ── Trigger Point Presence ──────────────────────────────────────────

describe("Add Lead button placement", () => {
  it("Leads page has New Seller Lead button that triggers new-prospect modal", () => {
    const leadsSrc = fs.readFileSync(
      path.resolve("src/app/(sentinel)/leads/page.tsx"),
      "utf-8",
    );
    expect(leadsSrc).toContain("New Seller Lead");
    expect(leadsSrc).toContain('openModal("new-prospect")');
    expect(leadsSrc).toContain("useModal");
  });

  it("Dashboard page has New Seller Lead button that triggers new-prospect modal", () => {
    const dashSrc = fs.readFileSync(
      path.resolve("src/app/(sentinel)/dashboard/page.tsx"),
      "utf-8",
    );
    expect(dashSrc).toContain("New Seller Lead");
    expect(dashSrc).toContain('openModal("new-prospect")');
    expect(dashSrc).toContain("useModal");
  });

  it("Prospects page retains its existing trigger", () => {
    const prospectsSrc = fs.readFileSync(
      path.resolve(
        "src/app/(sentinel)/sales-funnel/prospects/page.tsx",
      ),
      "utf-8",
    );
    expect(prospectsSrc).toContain('openModal("new-prospect")');
  });
});

// ── Operator-Facing Copy ────────────────────────────────────────────

describe("operator-facing modal copy uses 'Lead'", () => {
  let modalSrc: string;

  beforeAll(() => {
    modalSrc = fs.readFileSync(
      path.resolve("src/components/sentinel/new-prospect-modal.tsx"),
      "utf-8",
    );
  });

  it("dialog title says 'Add New Lead' not 'Add New Prospect'", () => {
    expect(modalSrc).toContain("Add New Lead");
    expect(modalSrc).not.toContain("Add New Prospect");
  });

  it("success state says 'Lead Created' not 'Prospect Created'", () => {
    expect(modalSrc).toContain("Lead Created");
    expect(modalSrc).not.toContain("Prospect Created");
  });

  it("save button says 'Save Lead'", () => {
    expect(modalSrc).toContain("Save Lead");
  });

  it("claim button says 'Claim This Lead'", () => {
    expect(modalSrc).toContain("Claim This Lead");
  });
});

// ── Layout Mount ────────────────────────────────────────────────────

describe("modal is mounted globally in layout", () => {
  it("sentinel layout renders NewProspectModal", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve("src/app/(sentinel)/layout.tsx"),
      "utf-8",
    );
    expect(layoutSrc).toContain("NewProspectModal");
  });
});
