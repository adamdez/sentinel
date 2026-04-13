export interface MakeOfferSignerDraft {
  name: string;
  email: string;
}

export interface MakeOfferDraft {
  purchasePrice: string;
  earnestMoney: string;
  closeDate: string;
  inspectionPeriodDays: string;
  expirationDate: string;
  expirationTime: string;
  buyerEntity: string;
  buyerSignerName: string;
  buyerSignerTitle: string;
  titleCompany: string;
  sellerSigners: MakeOfferSignerDraft[];
  notes: string;
}

export interface MakeOfferServerPayload {
  leadId: string;
  purchasePrice: number;
  earnestMoney: number;
  closeDate: string;
  inspectionPeriodDays: number;
  expirationAt: string;
  buyerEntity: string;
  buyerSignerName: string;
  buyerSignerTitle: string | null;
  titleCompany: string | null;
  sellerSigners: MakeOfferSignerDraft[];
  notes: string | null;
}

export interface OfferExecutionStatus {
  offerId: string;
  dealId: string;
  offerType: string;
  amount: number;
  offerStatus: string;
  provider: string;
  providerStatus: string;
  templateKey: string | null;
  envelopeId: string | null;
  senderViewUrl: string | null;
  sentAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface MakeOfferSupportCheck {
  supported: boolean;
  reasons: string[];
}

export function buildMakeOfferSupportCheck(input: {
  state: string | null | undefined;
  decisionMakerConfirmed: boolean | null | undefined;
  tags?: string[] | null | undefined;
  source?: string | null | undefined;
  sourceListName?: string | null | undefined;
  qualificationRoute?: string | null | undefined;
}): MakeOfferSupportCheck {
  const reasons: string[] = [];
  const state = (input.state ?? "").trim().toUpperCase();
  const haystacks = [
    ...(input.tags ?? []),
    input.source ?? "",
    input.sourceListName ?? "",
    input.qualificationRoute ?? "",
  ]
    .map((value) => value.toLowerCase())
    .filter(Boolean);

  if (state !== "WA") {
    reasons.push("Only Washington offers are supported in v1.");
  }

  if (!input.decisionMakerConfirmed) {
    reasons.push("Decision-maker must be confirmed before creating a legal offer.");
  }

  if (haystacks.some((value) => value.includes("probate") || value.includes("estate"))) {
    reasons.push("Probate and estate variants are blocked until a dedicated DocuSign template exists.");
  }

  return {
    supported: reasons.length === 0,
    reasons,
  };
}

export function createDefaultMakeOfferDraft(input: {
  offerAmount: number | null | undefined;
  offerStatusAmount: number | null | undefined;
  titleCompany?: string | null | undefined;
  sellerName?: string | null | undefined;
}): MakeOfferDraft {
  const now = new Date();
  const expiration = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const closeDate = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  return {
    purchasePrice: input.offerStatusAmount != null
      ? String(input.offerStatusAmount)
      : input.offerAmount != null
        ? String(input.offerAmount)
        : "",
    earnestMoney: "1000",
    closeDate: closeDate.toISOString().slice(0, 10),
    inspectionPeriodDays: "10",
    expirationDate: expiration.toISOString().slice(0, 10),
    expirationTime: "17:00",
    buyerEntity: "",
    buyerSignerName: "",
    buyerSignerTitle: "",
    titleCompany: input.titleCompany ?? "",
    sellerSigners: [
      {
        name: input.sellerName ?? "",
        email: "",
      },
    ],
    notes: "",
  };
}
