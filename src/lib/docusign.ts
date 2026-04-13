import { createSign } from "crypto";

type DocusignTemplateRole = {
  email: string;
  name: string;
  roleName: string;
  tabs?: {
    textTabs?: Array<{ tabLabel: string; value: string }>;
  };
};

export interface DocusignEnvelopeInput {
  externalOfferId: string;
  leadId: string;
  dealId: string;
  propertyAddress: string;
  propertyCityStateZip: string;
  apn: string | null;
  purchasePrice: number;
  earnestMoney: number;
  closeDate: string;
  inspectionPeriodDays: number;
  expirationAt: string;
  buyerEntity: string;
  buyerSignerName: string;
  buyerSignerTitle: string | null;
  titleCompany: string | null;
  sellerSigners: Array<{ name: string; email: string }>;
  notes: string | null;
}

type DocusignConfig = {
  accountId: string;
  integrationKey: string;
  userId: string;
  authBaseUrl: string;
  privateKey: string;
  templateId: string;
  templateKey: string;
  sellerRoles: string[];
  returnUrl: string;
  tabMap: Record<string, string>;
};

type DocusignUserInfoAccount = {
  account_id?: string;
  is_default?: boolean;
  base_uri?: string;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required DocuSign env var: ${name}`);
  }
  return value.trim();
}

function getTabMap(): Record<string, string> {
  const raw = process.env.DOCUSIGN_WA_CASH_PSA_TAB_MAP_JSON;
  if (!raw) {
    return {
      propertyAddress: "PropertyAddress",
      propertyCityStateZip: "PropertyCityStateZip",
      apn: "PropertyAPN",
      purchasePrice: "PurchasePrice",
      earnestMoney: "EarnestMoney",
      closeDate: "CloseDate",
      inspectionPeriodDays: "InspectionPeriodDays",
      expirationDate: "OfferExpirationDate",
      expirationTime: "OfferExpirationTime",
      buyerEntity: "BuyerEntity",
      buyerSignerName: "BuyerSignerName",
      buyerSignerTitle: "BuyerSignerTitle",
      titleCompany: "TitleCompany",
      internalNotes: "SentinelInternalNotes",
      offerId: "SentinelOfferId",
      leadId: "SentinelLeadId",
      dealId: "SentinelDealId",
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => key.trim().length > 0 && typeof value === "string" && value.trim().length > 0),
    );
  } catch {
    throw new Error("DOCUSIGN_WA_CASH_PSA_TAB_MAP_JSON must be valid JSON");
  }
}

function getDocusignConfig(): DocusignConfig {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return {
    accountId: requireEnv("DOCUSIGN_ACCOUNT_ID"),
    integrationKey: requireEnv("DOCUSIGN_INTEGRATION_KEY"),
    userId: requireEnv("DOCUSIGN_USER_ID"),
    authBaseUrl: (process.env.DOCUSIGN_AUTH_BASE_URL?.trim() || "https://account-d.docusign.com").replace(/\/+$/, ""),
    privateKey: requireEnv("DOCUSIGN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    templateId: requireEnv("DOCUSIGN_WA_CASH_PSA_TEMPLATE_ID"),
    templateKey: "wa_cash_psa_v1",
    sellerRoles: (process.env.DOCUSIGN_WA_CASH_PSA_SELLER_ROLES?.split(",") ?? ["Seller 1", "Seller 2"])
      .map((value) => value.trim())
      .filter(Boolean),
    returnUrl: `${siteUrl.replace(/\/+$/, "")}/gmail?offer_return=docusign`,
    tabMap: getTabMap(),
  };
}

function signJwt(config: DocusignConfig) {
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: config.authBaseUrl.replace(/^https?:\/\//, ""),
    iat,
    exp: iat + 3600,
    scope: "signature impersonation",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const body = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(body);
  signer.end();

  const signature = signer.sign(config.privateKey);
  return `${body}.${base64UrlEncode(signature)}`;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `DocuSign request failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function getAccessToken(config: DocusignConfig) {
  const assertion = signJwt(config);
  const response = await fetch(`${config.authBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `DocuSign auth failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("DocuSign auth did not return an access token");
  }
  return payload.access_token;
}

async function getBaseApiUrl(config: DocusignConfig, accessToken: string) {
  const userInfo = await fetchJson<{ accounts?: DocusignUserInfoAccount[] }>(`${config.authBaseUrl}/oauth/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const account =
    userInfo.accounts?.find((item) => item.account_id === config.accountId)
    ?? userInfo.accounts?.find((item) => item.is_default)
    ?? userInfo.accounts?.[0];

  if (!account?.base_uri) {
    throw new Error("DocuSign userinfo did not include a usable base_uri");
  }

  return `${account.base_uri.replace(/\/+$/, "")}/restapi`;
}

function buildTextTabs(config: DocusignConfig, input: DocusignEnvelopeInput) {
  const expiration = new Date(input.expirationAt);
  const dateString = Number.isNaN(expiration.getTime())
    ? input.expirationAt
    : expiration.toLocaleDateString("en-US");
  const timeString = Number.isNaN(expiration.getTime())
    ? input.expirationAt
    : expiration.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const values: Record<string, string | null> = {
    propertyAddress: input.propertyAddress,
    propertyCityStateZip: input.propertyCityStateZip,
    apn: input.apn,
    purchasePrice: String(input.purchasePrice),
    earnestMoney: String(input.earnestMoney),
    closeDate: input.closeDate,
    inspectionPeriodDays: String(input.inspectionPeriodDays),
    expirationDate: dateString,
    expirationTime: timeString,
    buyerEntity: input.buyerEntity,
    buyerSignerName: input.buyerSignerName,
    buyerSignerTitle: input.buyerSignerTitle,
    titleCompany: input.titleCompany,
    internalNotes: input.notes,
    offerId: input.externalOfferId,
    leadId: input.leadId,
    dealId: input.dealId,
  };

  return Object.entries(values)
    .map(([key, value]) => {
      const tabLabel = config.tabMap[key];
      if (!tabLabel || value == null || value.trim().length === 0) return null;
      return { tabLabel, value };
    })
    .filter((value): value is { tabLabel: string; value: string } => value != null);
}

function buildTemplateRoles(config: DocusignConfig, input: DocusignEnvelopeInput): DocusignTemplateRole[] {
  const textTabs = buildTextTabs(config, input);
  return input.sellerSigners.map((seller, index) => ({
    email: seller.email,
    name: seller.name,
    roleName: config.sellerRoles[index] ?? `Seller ${index + 1}`,
    tabs: index === 0 && textTabs.length > 0 ? { textTabs } : undefined,
  }));
}

export async function createDocusignOfferDraft(input: DocusignEnvelopeInput) {
  const config = getDocusignConfig();
  const accessToken = await getAccessToken(config);
  const apiBaseUrl = await getBaseApiUrl(config, accessToken);
  const templateRoles = buildTemplateRoles(config, input);

  const envelope = await fetchJson<{
    envelopeId?: string;
    status?: string;
  }>(`${apiBaseUrl}/v2.1/accounts/${config.accountId}/envelopes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "created",
      templateId: config.templateId,
      templateRoles,
    }),
  });

  if (!envelope.envelopeId) {
    throw new Error("DocuSign did not return an envelope ID");
  }

  const senderView = await fetchJson<{ url?: string }>(
    `${apiBaseUrl}/v2.1/accounts/${config.accountId}/envelopes/${envelope.envelopeId}/views/sender`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        returnUrl: config.returnUrl,
      }),
    },
  );

  if (!senderView.url) {
    throw new Error("DocuSign did not return a sender review URL");
  }

  return {
    provider: "docusign" as const,
    templateKey: config.templateKey,
    envelopeId: envelope.envelopeId,
    senderViewUrl: senderView.url,
    providerStatus: envelope.status ?? "created",
  };
}
