// Live Signal feed — pure data logic (CC-FSR-LIVEWIRE-1.0).
//
// The storefront reads live rows from `public.signals` and three taxonomy
// tables (`faraday_themes`, `faraday_domains`, `faraday_subdomains`) and lets
// the subscriber filter by Theater (theme), Sector (domain) and Thread
// (sub-domain). UI copy uses the locked labels — the words "domain"/"subdomain"
// never surface to subscribers.
//
// IMPORTANT taxonomy shape (verified live 2026-07-24):
//   - themes  ← theme_code (T-00N), name, tagline
//   - domains ← domain_code (D#), domain_num, domain_name, emoji
//   - subdomains ← subdomain_code (D#.#), domain_code (FK → domains), theme_tags[]
// There is NO direct domain→theme column. A theme relates to a domain ONLY
// through the sub-domains it contains (subdomain.theme_tags). Likewise, live
// `signals.theme_tags` is almost always empty (3/425), so a signal's Theaters
// are DERIVED from the themes of the sub-domains it is tagged with (plus any
// explicit theme_tags it happens to carry). This keeps the Theater filter
// meaningful without fabricating anything.

export interface ThemeRow {
  theme_code: string;
  name: string;
  tagline: string | null;
}

export interface DomainRow {
  domain_code: string;
  domain_num: number;
  domain_name: string;
  emoji: string | null;
}

export interface SubdomainRow {
  subdomain_code: string;
  domain_code: string;
  display_name: string;
  theme_tags: string[];
}

// Row as it arrives from `public.signals` (jsonb arrays may be null).
export interface RawSignal {
  id: string;
  fired_at: string;
  source: string | null;
  theme_tags: string[] | null;
  domain_tags: string[] | null;
  subdomain_tags: string[] | null;
  company_tags: string[] | null;
  conviction: string | null;
  framing: string | null;
  byline: string | null;
  faradays_take: string | null;
}

// A signal enriched with the codes we filter on. Presentation-ready and free of
// any field the client does not need.
export interface FeedSignal {
  id: string;
  fired_at: string;
  source: string | null;
  themeCodes: string[]; // derived: own theme_tags ∪ themes of its sub-domains
  domainCodes: string[]; // own domain_tags ∪ parent domains of its sub-domains
  subdomainCodes: string[];
  conviction: string | null;
  framing: string | null;
  byline: string | null;
  faradaysTake: string | null;
}

export interface TaxonomyIndex {
  themes: ThemeRow[];
  domains: DomainRow[];
  subdomains: SubdomainRow[];
  /** domain_code → theme codes present across that domain's sub-domains. */
  domainThemeCodes: Record<string, string[]>;
  /** subdomain_code → row, for O(1) parent/theme lookups. */
  subdomainByCode: Record<string, SubdomainRow>;
}

export const ALL = "ALL" as const;

export interface FeedFilters {
  theme: string; // theme_code | ALL
  sector: string; // domain_code | ALL
  thread: string; // subdomain_code | ALL
}

export const DEFAULT_FILTERS: FeedFilters = {
  theme: ALL,
  sector: ALL,
  thread: ALL,
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function asArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

/** Precompute the derived taxonomy relationships once, server-side. */
export function buildTaxonomyIndex(
  themes: ThemeRow[],
  domains: DomainRow[],
  subdomains: SubdomainRow[],
): TaxonomyIndex {
  const subdomainByCode: Record<string, SubdomainRow> = {};
  const domainThemeSets: Record<string, Set<string>> = {};

  for (const sd of subdomains) {
    const row: SubdomainRow = { ...sd, theme_tags: asArray(sd.theme_tags) };
    subdomainByCode[sd.subdomain_code] = row;
    const set = (domainThemeSets[sd.domain_code] ??= new Set<string>());
    for (const t of row.theme_tags) set.add(t);
  }

  const domainThemeCodes: Record<string, string[]> = {};
  for (const [domainCode, set] of Object.entries(domainThemeSets)) {
    domainThemeCodes[domainCode] = Array.from(set);
  }

  return { themes, domains, subdomains, domainThemeCodes, subdomainByCode };
}

/** Enrich one raw signal with the codes used for filtering. */
export function enrichSignal(raw: RawSignal, index: TaxonomyIndex): FeedSignal {
  const subdomainCodes = asArray(raw.subdomain_tags);
  const ownDomainCodes = asArray(raw.domain_tags);
  const ownThemeCodes = asArray(raw.theme_tags);

  const parentDomains: string[] = [];
  const derivedThemes: string[] = [];
  for (const code of subdomainCodes) {
    const sd = index.subdomainByCode[code];
    if (!sd) continue;
    parentDomains.push(sd.domain_code);
    for (const t of sd.theme_tags) derivedThemes.push(t);
  }

  return {
    id: raw.id,
    fired_at: raw.fired_at,
    source: raw.source,
    themeCodes: uniq([...ownThemeCodes, ...derivedThemes]),
    domainCodes: uniq([...ownDomainCodes, ...parentDomains]),
    subdomainCodes: uniq(subdomainCodes),
    conviction: raw.conviction,
    framing: raw.framing,
    byline: raw.byline,
    faradaysTake: raw.faradays_take,
  };
}

export function enrichSignals(
  raws: RawSignal[],
  index: TaxonomyIndex,
): FeedSignal[] {
  return raws.map((r) => enrichSignal(r, index));
}

/**
 * Domains selectable under the current Theater. With no Theater chosen, every
 * domain is offered; otherwise only domains that contain at least one
 * sub-domain in that theme.
 */
export function domainsForTheme(
  index: TaxonomyIndex,
  themeCode: string,
): DomainRow[] {
  if (themeCode === ALL) return index.domains;
  return index.domains.filter((d) =>
    (index.domainThemeCodes[d.domain_code] ?? []).includes(themeCode),
  );
}

/**
 * Threads selectable under the current Theater + Sector. Sector narrows to that
 * domain's sub-domains; Theater narrows to sub-domains carrying that theme; both
 * compose. With neither set, every sub-domain is offered.
 */
export function threadsFor(
  index: TaxonomyIndex,
  themeCode: string,
  sectorCode: string,
): SubdomainRow[] {
  return index.subdomains.filter((sd) => {
    if (sectorCode !== ALL && sd.domain_code !== sectorCode) return false;
    if (themeCode !== ALL && !sd.theme_tags.includes(themeCode)) return false;
    return true;
  });
}

/** True when a signal satisfies all active (non-ALL) filters. */
export function signalMatchesFilters(
  signal: FeedSignal,
  filters: FeedFilters,
): boolean {
  if (filters.theme !== ALL && !signal.themeCodes.includes(filters.theme)) {
    return false;
  }
  if (filters.sector !== ALL && !signal.domainCodes.includes(filters.sector)) {
    return false;
  }
  if (filters.thread !== ALL && !signal.subdomainCodes.includes(filters.thread)) {
    return false;
  }
  return true;
}

export function filterSignals(
  signals: FeedSignal[],
  filters: FeedFilters,
): FeedSignal[] {
  return signals.filter((s) => signalMatchesFilters(s, filters));
}

/**
 * Reconcile child selections when a parent changes: clearing a parent (or moving
 * to one that no longer contains the chosen child) resets the now-invalid child
 * back to ALL. Returns a corrected filter set.
 */
export function reconcileFilters(
  index: TaxonomyIndex,
  next: FeedFilters,
): FeedFilters {
  const result: FeedFilters = { ...next };

  // Sector must be valid under the chosen Theater.
  if (result.sector !== ALL) {
    const validSectors = domainsForTheme(index, result.theme).map(
      (d) => d.domain_code,
    );
    if (!validSectors.includes(result.sector)) result.sector = ALL;
  }

  // Thread must be valid under the chosen Theater + Sector.
  if (result.thread !== ALL) {
    const validThreads = threadsFor(index, result.theme, result.sector).map(
      (s) => s.subdomain_code,
    );
    if (!validThreads.includes(result.thread)) result.thread = ALL;
  }

  return result;
}

// Conviction badge tiers (Decision 7). Live distinct values are High / Medium /
// Low. Mapped within the locked brand palette: gold = highest, sage = middle,
// cream = lowest. Unknown/absent conviction yields no badge (never fabricated).
export type ConvictionTier = "high" | "medium" | "low" | null;

export function convictionTier(value: string | null | undefined): ConvictionTier {
  switch ((value ?? "").trim().toLowerCase()) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return null;
  }
}

/** Rolling 24h window (not calendar-day) so the ticker is never empty pre-cron. */
export function within24h(signals: FeedSignal[], nowMs: number): FeedSignal[] {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  return signals.filter((s) => {
    const t = Date.parse(s.fired_at);
    return Number.isFinite(t) && t >= cutoff;
  });
}
