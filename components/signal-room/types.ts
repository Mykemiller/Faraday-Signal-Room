// UI-facing types for the configurator (client side).

export interface ThemeRow {
  theme_code: string;
  name: string;
  tagline: string | null;
}
export interface DomainRow {
  domain_code: string;
  domain_name: string;
  emoji: string | null;
}
export interface SubdomainRow {
  subdomain_code: string;
  domain_code: string;
  display_name: string;
}
export interface CompanyRow {
  company_id: string;
  name: string;
}

export interface Taxonomy {
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
  companies: CompanyRow[];
}

export type Frequency = "realtime" | "daily" | "weekly" | "monthly";
export type DeliveryRail = "email_digest" | "in_app";

// A composed rule in the UI: one dimension + a chosen id (review item 1).
export interface DraftRule {
  key: string; // local uid
  dimension: "theme" | "domain" | "subdomain" | "company";
  refId: string; // theme_code | domain_code | subdomain_code | company_id
  label: string; // plain-language label for the summary band
  frequency: Frequency;
  delivery_rail: DeliveryRail;
}

// Maps a DraftRule to the API's IncomingRule shape (discrete typed FK columns).
export function toApiRule(rule: DraftRule) {
  const base = {
    dimension: rule.dimension,
    theme_code: null as string | null,
    domain_code: null as string | null,
    subdomain_code: null as string | null,
    company_id: null as string | null,
    threshold_spec: null,
    frequency: rule.frequency,
    delivery_rail: rule.delivery_rail,
  };
  switch (rule.dimension) {
    case "theme":
      base.theme_code = rule.refId;
      break;
    case "domain":
      base.domain_code = rule.refId;
      break;
    case "subdomain":
      base.subdomain_code = rule.refId;
      break;
    case "company":
      base.company_id = rule.refId;
      break;
  }
  return base;
}
