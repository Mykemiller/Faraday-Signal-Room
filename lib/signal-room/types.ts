// Domain types for Signal Room (Design Spec v1.2, §4, §8).

export type ConfigurationStatus =
  | "inactive"
  | "active"
  | "paused"
  | "cancelled";

export type Dimension =
  | "theme"
  | "domain"
  | "subdomain"
  | "company"
  | "threshold";

export type Frequency =
  | "realtime"
  | "daily"
  | "weekly"
  | "monthly"
  | "threshold";

export type DeliveryRail = "email_digest" | "in_app";

// A single rule row carries exactly one taxonomy dimension (review item 1).
// Threshold rules carry a spec instead of a taxonomy id (review item 1 CHECK).
export interface ConfigurationRule {
  id: string;
  configuration_id: string;
  dimension: Dimension;
  theme_code: string | null;
  domain_code: string | null;
  subdomain_code: string | null;
  company_id: string | null;
  threshold_spec: Record<string, unknown> | null;
  frequency: Frequency;
  delivery_rail: DeliveryRail;
  paused: boolean;
  selection_order: number;
  added_at: string;
}

export interface SignalConfiguration {
  id: string;
  subscriber_id: string;
  status: ConfigurationStatus;
  activated_until: string | null;
  created_at: string;
  last_modified: string;
  rules?: ConfigurationRule[];
}

// The base Signal row (carries conviction — INTERNAL ONLY, never serialized out).
export interface Signal {
  id: string;
  fired_at: string;
  source: string;
  theme_tags: string[];
  domain_tags: string[];
  subdomain_tags: string[];
  company_tags: string[];
  conviction: string; // INTERNAL ONLY — must never leak (§4.3, §10)
  framing: string;
  byline: string | null;
  faradays_take: string | null;
}

// The subscriber-facing shape: conviction-free by construction.
export type SubscriberSignal = Omit<Signal, "conviction">;

// Caps (review item 6, §10).
export const MAX_RULES_PER_CONFIGURATION = 30;
export const DIGEST_COLLAPSE_THRESHOLD = 20;
export const DIGEST_COLLAPSE_TOP_N = 5;

export const PRODUCT_KEY = "signal_room" as const;
