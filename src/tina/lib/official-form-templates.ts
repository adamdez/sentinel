import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaOfficialFederalFormId,
  TinaOfficialFederalFormTemplate,
  TinaOfficialFederalFormTemplateSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

const TINA_OFFICIAL_FORM_TEMPLATE_REGISTRY: Record<string, TinaOfficialFederalFormTemplate[]> = {
  "2025": [
    {
      id: "f1040",
      taxYear: "2025",
      formNumber: "Form 1040",
      title: "2025 Form 1040",
      role: "companion_schedule",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1040--2025.pdf",
      fileName: "f1040--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1040--2025.pdf",
      sha256: "3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982",
      byteLength: 220237,
      laneIds: ["schedule_c_single_member_llc"],
      summary: "Blank IRS Form 1040 stored locally as the individual-return foundation for Schedule C review output.",
    },
    {
      id: "f1040sc",
      taxYear: "2025",
      formNumber: "Schedule C (Form 1040)",
      title: "2025 Schedule C (Form 1040)",
      role: "primary_return",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1040sc--2025.pdf",
      fileName: "f1040sc--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1040sc--2025.pdf",
      sha256: "ddf401dbe060467d39f90ad2abf645df1de31512821a150dc68a3882bbf19716",
      byteLength: 122589,
      laneIds: ["schedule_c_single_member_llc"],
      summary: "Blank IRS Schedule C stored locally. Tina can anchor draft review output to it, but does not yet fill it directly.",
    },
    {
      id: "f1040sse",
      taxYear: "2025",
      formNumber: "Schedule SE (Form 1040)",
      title: "2025 Schedule SE (Form 1040)",
      role: "companion_schedule",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1040sse--2025.pdf",
      fileName: "f1040sse--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1040sse--2025.pdf",
      sha256: "05bc2b3e1dfca65d8c6fc6d652af4fa3736e953c6575d6e9f82590484677d347",
      byteLength: 80290,
      laneIds: ["schedule_c_single_member_llc"],
      summary: "Blank Schedule SE stored locally for self-employment tax review and future form-set completeness.",
    },
    {
      id: "f1065",
      taxYear: "2025",
      formNumber: "Form 1065",
      title: "2025 Form 1065",
      role: "primary_return",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1065--2025.pdf",
      fileName: "f1065--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1065--2025.pdf",
      sha256: "0f19f556e12ef53c41ba27e5930b4373103f3abcf64693c4ea686451b2a8f56f",
      byteLength: 334608,
      laneIds: ["1065"],
      summary: "Blank IRS partnership return stored locally so Tina can anchor wild-LLC reviewer work to the right federal form family.",
    },
    {
      id: "f1120s",
      taxYear: "2025",
      formNumber: "Form 1120-S",
      title: "2025 Form 1120-S",
      role: "primary_return",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1120s--2025.pdf",
      fileName: "f1120s--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1120s--2025.pdf",
      sha256: "c4b7cae7f2283a2e3225523ea001a710109fee34aad909461421025b287cd18d",
      byteLength: 267113,
      laneIds: ["1120_s"],
      summary: "Blank IRS S-corporation return stored locally so Tina can route S-elected LLC files against the correct federal form family.",
    },
    {
      id: "f1120",
      taxYear: "2025",
      formNumber: "Form 1120",
      title: "2025 Form 1120",
      role: "primary_return",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f1120--2025.pdf",
      fileName: "f1120--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f1120--2025.pdf",
      sha256: "016c7fb4042a565c23a98014b17019af7ddc89e3260dd3f926b84d6688b7be6e",
      byteLength: 340034,
      laneIds: ["1120"],
      summary: "Blank IRS C-corporation return stored locally so Tina can route corporate-election files against the correct federal form family.",
    },
    {
      id: "f8829",
      taxYear: "2025",
      formNumber: "Form 8829",
      title: "2025 Form 8829",
      role: "attachment",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f8829--2025.pdf",
      fileName: "f8829--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f8829--2025.pdf",
      sha256: "994834c9eeacdb371f5d75e8ed272bda6e9fd601898af57670b6b2c47665890b",
      byteLength: 82821,
      laneIds: ["schedule_c_single_member_llc"],
      summary: "Blank home-office form stored locally for reviewer context when home-office treatment comes into play.",
    },
    {
      id: "f4562",
      taxYear: "2025",
      formNumber: "Form 4562",
      title: "2025 Form 4562",
      role: "attachment",
      support: "blank_stored",
      irsUrl: "https://www.irs.gov/pub/irs-prior/f4562--2025.pdf",
      fileName: "f4562--2025.pdf",
      localAssetPath: "src/tina/data/irs-forms/2025/f4562--2025.pdf",
      sha256: "c05f9d1f5e26b1b21e18b0a13adbbcd3d568bb9f3ca53bd7bba7c795c7799b4a",
      byteLength: 206401,
      laneIds: ["schedule_c_single_member_llc"],
      summary: "Blank depreciation and amortization form stored locally for reviewer context and future fixed-asset output.",
    },
  ],
};

function cloneTemplate(template: TinaOfficialFederalFormTemplate): TinaOfficialFederalFormTemplate {
  return {
    ...template,
    laneIds: [...template.laneIds],
  };
}

function getTaxYearRegistry(taxYear: string): TinaOfficialFederalFormTemplate[] {
  return TINA_OFFICIAL_FORM_TEMPLATE_REGISTRY[taxYear]?.map(cloneTemplate) ?? [];
}

export function listTinaOfficialFederalFormTemplates(
  taxYear: string
): TinaOfficialFederalFormTemplate[] {
  return getTaxYearRegistry(taxYear);
}

export function getTinaOfficialFederalFormTemplate(
  formId: TinaOfficialFederalFormId,
  taxYear: string
): TinaOfficialFederalFormTemplate | null {
  return getTaxYearRegistry(taxYear).find((template) => template.id === formId) ?? null;
}

export function buildTinaOfficialFederalFormTemplateSnapshot(
  draft: TinaWorkspaceDraft
): TinaOfficialFederalFormTemplateSnapshot {
  const taxYear = draft.profile.taxYear || "2025";
  const startPath = buildTinaStartPathAssessment(draft);
  const templates = getTaxYearRegistry(taxYear).filter((template) =>
    template.laneIds.includes(startPath.recommendation.laneId)
  );
  const primaryTemplate =
    templates.find((template) => template.role === "primary_return") ?? null;
  const storedBlankTemplateIds = templates
    .filter((template) => template.support === "blank_stored")
    .map((template) => template.id);
  const summary =
    templates.length > 0
      ? `Tina has ${templates.length} stored official blank federal form template(s) for the routed ${startPath.recommendation.title} family.`
      : `Tina does not have a stored official blank federal form template for the routed ${startPath.recommendation.title} family yet.`;
  const nextStep =
    templates.length > 0
      ? "Use the stored blanks as reviewer-grade foundations while Tina's true field-fill engine catches up."
      : "Store the correct federal blank form family for this routed lane before calling output close to final.";

  return {
    lastBuiltAt: new Date().toISOString(),
    taxYear,
    laneId: startPath.recommendation.laneId,
    summary,
    nextStep,
    primaryTemplateId: primaryTemplate?.id ?? null,
    templates,
    storedBlankTemplateIds,
  };
}
