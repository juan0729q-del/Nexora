import type { ProductNiche } from "@/lib/products";

export const intelligenceEventTypes = [
  "page_viewed",
  "product_viewed",
  "variant_selected",
  "cart_added",
  "cart_removed",
  "shipping_quote_requested",
  "shipping_quote_succeeded",
  "shipping_quote_failed",
  "shipping_method_selected",
  "checkout_started",
  "checkout_created",
  "checkout_failed",
] as const;

export type IntelligenceEventType = typeof intelligenceEventTypes[number];
export type IntelligenceEvent = {
  eventId: string;
  sessionId: string;
  type: IntelligenceEventType;
  occurredAt: string;
  page: string;
  productSlug?: string;
  productSku?: string;
  variantSku?: string;
  niche?: ProductNiche;
  quantity?: number;
  valueCop?: number;
  source?: string;
};

export type IntelligenceAction =
  | "promote_product"
  | "monitor_product"
  | "pause_product"
  | "start_experiment"
  | "source_candidate";

export type IntelligenceProposalStatus = "proposed" | "authorized" | "rejected" | "executed" | "expired";
export type IntelligenceEvidence = {
  label: string;
  value: string;
  source: "nexora" | "cj" | "gdelt" | "wikimedia" | "operator";
};

export type IntelligenceProposal = {
  id: string;
  createdAt: string;
  expiresAt: string;
  action: IntelligenceAction;
  status: IntelligenceProposalStatus;
  targetSku?: string;
  targetSlug?: string;
  niche: ProductNiche;
  title: string;
  summary: string;
  rationale: string[];
  benefits: string[];
  risks: string[];
  implications: string;
  rollback: string;
  confidencePercent: number;
  evidence: IntelligenceEvidence[];
  execution: "advisory" | "merchandising" | "catalog_workflow";
  decidedAt?: string;
  decisionNote?: string;
};

export type IntelligenceEventSummary = {
  firstEventAt: string | null;
  lastEventAt: string | null;
  trackedEvents: number;
  trackedSessions: number;
  productViews: number;
  cartAdds: number;
  shippingQuotes: number;
  checkoutStarts: number;
  checkoutCreated: number;
  eventCoveragePercent: number;
};

export type AutonomyGate = {
  id: string;
  label: string;
  current: number;
  target: number;
  unit: string;
  met: boolean;
  reason: string;
};

export type AutonomyReadiness = {
  eligible: boolean;
  scorePercent: number;
  requiredConsecutiveDays: number;
  gates: AutonomyGate[];
  permanentlyHumanControlled: string[];
};

export type MarketSignal = {
  source: "gdelt" | "wikimedia";
  query: string;
  market: "global" | "US" | "CO";
  score: number;
  observedAt: string;
  detail: string;
  available: boolean;
};

