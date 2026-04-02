import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTinaAuthorityResearchPrompt,
  runTinaAuthorityResearch,
} from "@/tina/lib/research-runner";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaAuthorityWorkItemView } from "@/tina/lib/authority-work";
import type { TinaResearchDossier } from "@/tina/lib/research-dossiers";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  OpenAI: vi.fn(),
  zodTextFormat: vi.fn(),
}));

vi.mock("openai", () => ({
  default: mocks.OpenAI,
}));

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: mocks.zodTextFormat,
}));

const draft = {
  ...createDefaultTinaWorkspaceDraft(),
  documents: [
    {
      id: "doc-ownership",
      name: "ownership-change-ledger.csv",
      size: 100,
      mimeType: "text/csv",
      storagePath: "tina/ownership-change-ledger.csv",
      category: "supporting_document" as const,
      requestId: "ownership-support",
      requestLabel: "Ownership and entity papers",
      uploadedAt: "2026-03-27T04:00:00.000Z",
    },
  ],
  sourceFacts: [
    {
      id: "fact-ownership-change",
      sourceDocumentId: "doc-ownership",
      label: "Ownership change clue",
      value: "This paper mentions an ownership change, buyout, redemption, or partner exit.",
      confidence: "medium" as const,
      capturedAt: "2026-03-27T04:10:00.000Z",
    },
  ],
};

const dossier: TinaResearchDossier = {
  id: "ownership-change-treatment-review",
  title: "Check ownership change, buyout, and former-owner payment treatment",
  status: "needs_primary_authority",
  summary: "Review ownership transition treatment.",
  whyItMatters: "Ownership transitions can change the return path and payout treatment.",
  nextStep: "Find primary authority.",
  authorityPrompt: "Use primary authority only.",
  discoveryPrompt: "Research ownership change treatment.",
  groundingLabels: ["Tina found ownership-change or former-owner payment clues in uploaded papers."],
  steps: [],
  documentIds: ["doc-ownership"],
  factIds: ["fact-ownership-change"],
};

const workItem: TinaAuthorityWorkItemView = {
  ideaId: dossier.id,
  status: "researching",
  reviewerDecision: "pending",
  disclosureDecision: "unknown",
  memo: "",
  reviewerNotes: "",
  missingAuthority: [],
  citations: [],
  lastAiRunAt: null,
  updatedAt: null,
  title: dossier.title,
  summary: dossier.summary,
  nextStep: dossier.nextStep,
  memoFocus: "Confirm how ownership changes affect filing path and payout treatment.",
  reviewerQuestion: "Do the ownership-change facts alter the filing lane or treatment of payouts?",
  authorityTargets: ["partnership tax authority", "transaction documents for owner exits"],
  documentIds: ["doc-ownership"],
  factIds: ["fact-ownership-change"],
};

describe("runTinaAuthorityResearch", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";

    mocks.OpenAI.mockImplementation(function MockOpenAI() {
      return {
        responses: {
          parse: mocks.parse,
        },
      };
    });

    mocks.zodTextFormat.mockReturnValue({ type: "json_schema" });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      runTinaAuthorityResearch({
        draft,
        dossier,
        workItem,
      })
    ).rejects.toThrow("OPENAI_API_KEY");
  });

  it("builds a research prompt with linked source facts, documents, and authority targets", () => {
    const prompt = buildTinaAuthorityResearchPrompt(draft, dossier, workItem);

    expect(prompt).toContain("Lane recommendation:");
    expect(prompt).toContain("Why it matters:");
    expect(prompt).toContain("Grounding context:");
    expect(prompt).toContain("ownership-change or former-owner payment clues");
    expect(prompt).toContain("Start-path reasons:");
    expect(prompt).toContain("Start-path blockers:");
    expect(prompt).toContain("Authority targets:");
    expect(prompt).toContain("partnership tax authority");
    expect(prompt).toContain("Linked source facts:");
    expect(prompt).toContain("Ownership change clue");
    expect(prompt).toContain("Linked source documents:");
    expect(prompt).toContain("ownership-change-ledger.csv");
  });

  it("forces human conflict resolution when primary support and warning both exist", async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        summary: "Potentially usable, but mixed authority outcomes.",
        memo: "Support exists, but conflicting primary authority warns against broad use.",
        substantialAuthorityLikely: true,
        reasonableBasisLikely: true,
        needsDisclosure: false,
        looksLikeTaxShelterOrReportableTransaction: false,
        isFrivolous: false,
        citations: [
          {
            title: "IRS Guidance",
            url: "https://www.irs.gov/some-guidance",
            effect: "supports",
            note: "Points toward eligibility.",
          },
          {
            title: "U.S. Tax Court Memo",
            url: "https://www.ustaxcourt.gov/opinions/2026/example.pdf",
            effect: "warns",
            note: "Warns on fact pattern drift.",
          },
        ],
        missingAuthority: ["Need fact-pattern reconciliation memo."],
      },
    });

    const result = await runTinaAuthorityResearch({
      draft,
      dossier,
      workItem,
    });

    expect(result.status).toBe("researching");
    expect(result.reviewerDecision).toBe("need_more_support");
    expect(result.disclosureDecision).toBe("not_needed");
    expect(result.missingAuthority).toEqual(
      expect.arrayContaining([
        "Need fact-pattern reconciliation memo.",
        expect.stringContaining("Primary authority appears conflicted"),
      ])
    );
  });

  it("downgrades non-primary supports to background so they cannot masquerade as authority", async () => {
    mocks.parse.mockResolvedValue({
      output_parsed: {
        summary: "Discovery lead found.",
        memo: "Good discovery source, but not filing authority.",
        substantialAuthorityLikely: false,
        reasonableBasisLikely: false,
        needsDisclosure: false,
        looksLikeTaxShelterOrReportableTransaction: false,
        isFrivolous: false,
        citations: [
          {
            title: "Tax Adviser Article",
            url: "https://www.thetaxadviser.com/issues/2026/apr/sample.html",
            effect: "supports",
            note: "Helpful framing only.",
          },
        ],
        missingAuthority: ["Primary authority still missing."],
      },
    });

    const result = await runTinaAuthorityResearch({
      draft,
      dossier,
      workItem,
    });

    expect(result.status).toBe("researching");
    expect(result.reviewerDecision).toBe("need_more_support");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.sourceClass).toBe("secondary_analysis");
    expect(result.citations[0]?.effect).toBe("background");
  });
});
