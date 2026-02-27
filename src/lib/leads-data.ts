/**
 * Lead view model and dummy data for the consolidated Leads page.
 * TODO: Replace with Supabase queries via TanStack Query.
 */

import type { DistressType, AIScore, LeadStatus } from "./types";

export interface LeadRow {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerBadge: "absentee" | "corporate" | "inherited" | "elderly" | "out-of-state" | null;
  distressSignals: DistressType[];
  status: LeadStatus;
  assignedTo: string | null;
  assignedName: string | null;
  score: AIScore;
  predictivePriority: number;
  estimatedValue: number | null;
  equityPercent: number | null;
  followUpDate: string | null;
  lastContactAt: string | null;
  promotedAt: string;
  source: string;
  tags: string[];
  complianceClean: boolean;
  notes: string | null;
}

export const TEAM_MEMBERS = [
  { id: "user-adam", name: "Adam D.", role: "admin" as const },
  { id: "user-nathan", name: "Nathan B.", role: "agent" as const },
  { id: "user-logan", name: "Logan T.", role: "agent" as const },
] as const;

export type TeamMemberId = (typeof TEAM_MEMBERS)[number]["id"];

export type LeadSegment = "all" | "mine" | TeamMemberId;

const now = Date.now();
const day = 86400000;

export const DUMMY_LEADS: LeadRow[] = [
  {
    id: "lead-001",
    propertyId: "prop-001",
    apn: "123-45-678",
    county: "Maricopa",
    address: "1423 Oak Valley Dr",
    city: "Phoenix",
    state: "AZ",
    zip: "85004",
    ownerName: "Margaret Henderson",
    ownerPhone: "+16025551234",
    ownerEmail: "mhenderson@mail.com",
    ownerBadge: "elderly",
    distressSignals: ["probate", "tax_lien"],
    status: "lead",
    assignedTo: "user-adam",
    assignedName: "Adam D.",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" },
    predictivePriority: 98,
    estimatedValue: 385000,
    equityPercent: 72,
    followUpDate: new Date(now - day * 1).toISOString(),
    lastContactAt: new Date(now - day * 2).toISOString(),
    promotedAt: new Date(now - day * 5).toISOString(),
    source: "probate_scraper",
    tags: ["high-equity", "motivated"],
    complianceClean: true,
    notes: "Daughter managing estate. Very motivated to sell quickly.",
  },
  {
    id: "lead-002",
    propertyId: "prop-002",
    apn: "234-56-789",
    county: "Maricopa",
    address: "890 Maple St",
    city: "Mesa",
    state: "AZ",
    zip: "85201",
    ownerName: "Robert Chen",
    ownerPhone: "+14805552345",
    ownerEmail: null,
    ownerBadge: "absentee",
    distressSignals: ["pre_foreclosure", "vacant"],
    status: "lead",
    assignedTo: "user-nathan",
    assignedName: "Nathan B.",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" },
    predictivePriority: 85,
    estimatedValue: 290000,
    equityPercent: 45,
    followUpDate: new Date(now + day * 1).toISOString(),
    lastContactAt: new Date(now - day * 3).toISOString(),
    promotedAt: new Date(now - day * 8).toISOString(),
    source: "tax_lien_api",
    tags: ["absentee-owner"],
    complianceClean: true,
    notes: "Owner lives in California. Property vacant 6+ months.",
  },
  {
    id: "lead-003",
    propertyId: "prop-003",
    apn: "345-67-890",
    county: "Pinal",
    address: "2201 Desert Rose Ln",
    city: "Chandler",
    state: "AZ",
    zip: "85225",
    ownerName: "Patricia Voss",
    ownerPhone: "+14805553456",
    ownerEmail: "pvoss@outlook.com",
    ownerBadge: "inherited",
    distressSignals: ["probate", "inherited"],
    status: "negotiation",
    assignedTo: "user-adam",
    assignedName: "Adam D.",
    score: { composite: 78, motivation: 82, equityVelocity: 70, urgency: 75, historicalConversion: 68, aiBoost: 6, label: "hot" },
    predictivePriority: 76,
    estimatedValue: 425000,
    equityPercent: 88,
    followUpDate: new Date(now + day * 2).toISOString(),
    lastContactAt: new Date(now - day * 1).toISOString(),
    promotedAt: new Date(now - day * 12).toISOString(),
    source: "probate_scraper",
    tags: ["high-equity", "inherited"],
    complianceClean: true,
    notes: "Inherited from uncle. Open to offers above $340k.",
  },
  {
    id: "lead-004",
    propertyId: "prop-004",
    apn: "456-78-901",
    county: "Maricopa",
    address: "550 W Camelback Rd",
    city: "Phoenix",
    state: "AZ",
    zip: "85013",
    ownerName: "David Gutierrez",
    ownerPhone: "+16025554567",
    ownerEmail: null,
    ownerBadge: null,
    distressSignals: ["pre_foreclosure", "code_violation", "tax_lien"],
    status: "lead",
    assignedTo: "user-logan",
    assignedName: "Logan T.",
    score: { composite: 88, motivation: 91, equityVelocity: 78, urgency: 92, historicalConversion: 80, aiBoost: 10, label: "fire" },
    predictivePriority: 91,
    estimatedValue: 310000,
    equityPercent: 35,
    followUpDate: new Date(now - day * 2).toISOString(),
    lastContactAt: new Date(now - day * 5).toISOString(),
    promotedAt: new Date(now - day * 3).toISOString(),
    source: "tax_lien_api",
    tags: ["stacked-distress", "urgent"],
    complianceClean: true,
    notes: "Triple stacked — pre-foreclosure + code violation + tax lien. Very motivated.",
  },
  {
    id: "lead-005",
    propertyId: "prop-005",
    apn: "567-89-012",
    county: "Maricopa",
    address: "1800 N 32nd St",
    city: "Phoenix",
    state: "AZ",
    zip: "85008",
    ownerName: "Sandra Williams",
    ownerPhone: "+16025555678",
    ownerEmail: "swilliams@gmail.com",
    ownerBadge: "out-of-state",
    distressSignals: ["divorce", "vacant"],
    status: "lead",
    assignedTo: "user-nathan",
    assignedName: "Nathan B.",
    score: { composite: 71, motivation: 75, equityVelocity: 65, urgency: 70, historicalConversion: 60, aiBoost: 5, label: "warm" },
    predictivePriority: 68,
    estimatedValue: 265000,
    equityPercent: 55,
    followUpDate: new Date(now + day * 3).toISOString(),
    lastContactAt: new Date(now - day * 7).toISOString(),
    promotedAt: new Date(now - day * 10).toISOString(),
    source: "manual",
    tags: ["divorce"],
    complianceClean: true,
    notes: "Divorce settlement pending. Will sell once finalized.",
  },
  {
    id: "lead-006",
    propertyId: "prop-006",
    apn: "678-90-123",
    county: "Pinal",
    address: "3340 E Baseline Rd",
    city: "Gilbert",
    state: "AZ",
    zip: "85234",
    ownerName: "Frank Morrison",
    ownerPhone: "+14805556789",
    ownerEmail: null,
    ownerBadge: "corporate",
    distressSignals: ["bankruptcy"],
    status: "prospect",
    assignedTo: null,
    assignedName: null,
    score: { composite: 62, motivation: 60, equityVelocity: 58, urgency: 65, historicalConversion: 55, aiBoost: 4, label: "warm" },
    predictivePriority: 55,
    estimatedValue: 340000,
    equityPercent: 40,
    followUpDate: null,
    lastContactAt: null,
    promotedAt: new Date(now - day * 1).toISOString(),
    source: "bankruptcy_scraper",
    tags: [],
    complianceClean: true,
    notes: null,
  },
  {
    id: "lead-007",
    propertyId: "prop-007",
    apn: "789-01-234",
    county: "Maricopa",
    address: "4420 W Glendale Ave",
    city: "Glendale",
    state: "AZ",
    zip: "85301",
    ownerName: "Helen Park",
    ownerPhone: "+16235557890",
    ownerEmail: "hpark@yahoo.com",
    ownerBadge: "elderly",
    distressSignals: ["tax_lien", "absentee"],
    status: "lead",
    assignedTo: "user-logan",
    assignedName: "Logan T.",
    score: { composite: 55, motivation: 50, equityVelocity: 52, urgency: 58, historicalConversion: 48, aiBoost: 3, label: "warm" },
    predictivePriority: 48,
    estimatedValue: 220000,
    equityPercent: 62,
    followUpDate: new Date(now + day * 5).toISOString(),
    lastContactAt: new Date(now - day * 10).toISOString(),
    promotedAt: new Date(now - day * 15).toISOString(),
    source: "tax_lien_api",
    tags: [],
    complianceClean: false,
    notes: "DNC registered — cannot dial.",
  },
  {
    id: "lead-008",
    propertyId: "prop-008",
    apn: "890-12-345",
    county: "Maricopa",
    address: "1100 E Indian School Rd",
    city: "Phoenix",
    state: "AZ",
    zip: "85014",
    ownerName: "James Okoro",
    ownerPhone: "+16025558901",
    ownerEmail: "jokoro@gmail.com",
    ownerBadge: null,
    distressSignals: ["fsbo"],
    status: "nurture",
    assignedTo: "user-adam",
    assignedName: "Adam D.",
    score: { composite: 42, motivation: 40, equityVelocity: 45, urgency: 38, historicalConversion: 35, aiBoost: 2, label: "warm" },
    predictivePriority: 35,
    estimatedValue: 475000,
    equityPercent: 80,
    followUpDate: new Date(now + day * 14).toISOString(),
    lastContactAt: new Date(now - day * 20).toISOString(),
    promotedAt: new Date(now - day * 30).toISOString(),
    source: "fsbo_scraper",
    tags: ["fsbo", "high-value"],
    complianceClean: true,
    notes: "Wants to try FSBO first. Check back in 2 weeks.",
  },
];
