// Coach surface identifiers — one per CRM page/context
export type CoachSurface =
  | "lead_detail"
  | "lead_detail_closeout"
  | "pipeline"
  | "leads_inbox"
  | "dialer"
  | "import"
  | "buyers"
  | "dispo";

// Content classification — always shown to operator
export type CoachItemType = "hard_rule" | "recommended" | "suggestion";

// Functional category — determines which panel section shows the item
export type CoachCategory = "blocker" | "next_step" | "explainer" | "tip";

// Context passed by each surface to the coach engine
export type CoachContext = {
  surface: CoachSurface;
  lead?: {
    id?: string;
    status?: string;
    qualification_route?: string;
    assigned_to?: string;
    calls_count: number;
    next_action_at?: string;
    last_contact_at?: string;
    qualification_completeness: number; // 0.0 – 1.0
    offer_amount?: number;
    has_note_context: boolean;
    has_disposition?: boolean;
    address?: string;
  };
  pipeline?: {
    dragTarget?: string;
    dragBlocked?: boolean;
    dragBlockReason?: string;
  };
  inbox?: {
    overdue_count: number;
    new_inbound_count: number;
    unqualified_count: number;
    escalated_count: number;
  };
  closeout?: {
    action_type?: string;
    has_date: boolean;
    has_disposition: boolean;
    has_note: boolean;
  };
  importCtx?: {
    step: string;
    low_confidence_count: number;
    duplicate_count: number;
  };
  buyersCtx?: {
    total_buyers: number;
    unverified_pof_count: number;
    no_market_count: number;
  };
  dispoCtx?: {
    total_deals: number;
    stalled_count: number;
    no_buyers_linked_count: number;
    selected_buyer_count: number;
  };
};

// A single coach content item
export type CoachItem = {
  id: string;
  type: CoachItemType;
  category: CoachCategory;
  title: string;
  body: string | ((ctx: CoachContext) => string); // static or dynamic text
  surfaces: CoachSurface[];
  condition: (ctx: CoachContext) => boolean;
  priority: number; // lower = more important, shown first
};

// Output from the coach engine
export type CoachOutput = {
  blockers: CoachItem[];
  nextSteps: CoachItem[];
  explainers: CoachItem[];
  tips: CoachItem[];
};
