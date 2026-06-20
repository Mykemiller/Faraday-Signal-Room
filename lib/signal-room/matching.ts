import type { ConfigurationRule, Signal, SubscriberSignal } from "./types";

/**
 * Deterministic matching (review item 4, §4.4): a Signal matches a
 * configuration if it satisfies ANY single active rule (OR union across rows).
 * Each rule carries exactly one dimension. Compound AND is deferred to V2.
 *
 * Works on either the base Signal or the conviction-free SubscriberSignal,
 * since only the tag arrays are inspected.
 */
type SignalTags = Pick<
  Signal,
  "theme_tags" | "domain_tags" | "subdomain_tags" | "company_tags"
>;

export function ruleMatchesSignal(
  rule: ConfigurationRule,
  signal: SignalTags,
): boolean {
  if (rule.paused) return false;

  switch (rule.dimension) {
    case "theme":
      return !!rule.theme_code && signal.theme_tags.includes(rule.theme_code);
    case "domain":
      return !!rule.domain_code && signal.domain_tags.includes(rule.domain_code);
    case "subdomain":
      return (
        !!rule.subdomain_code &&
        signal.subdomain_tags.includes(rule.subdomain_code)
      );
    case "company":
      return !!rule.company_id && signal.company_tags.includes(rule.company_id);
    case "threshold":
      // Threshold rules are evaluated by the delivery automation against the
      // threshold_spec, not by tag membership. Out of MVP matching scope.
      return false;
    default:
      return false;
  }
}

export function signalMatchesConfiguration(
  rules: ConfigurationRule[],
  signal: SignalTags,
): boolean {
  return rules.some((rule) => ruleMatchesSignal(rule, signal));
}

export function filterMatchingSignals<T extends SignalTags>(
  rules: ConfigurationRule[],
  signals: T[],
): T[] {
  const active = rules.filter((r) => !r.paused);
  if (active.length === 0) return [];
  return signals.filter((s) => signalMatchesConfiguration(active, s));
}

/**
 * Runaway-volume guard (review item 6, §10): if a sweep yields more than
 * DIGEST_COLLAPSE_THRESHOLD matches, collapse to the top N and flag that the
 * rest live behind a secure in-app link.
 */
import { DIGEST_COLLAPSE_THRESHOLD, DIGEST_COLLAPSE_TOP_N } from "./types";

export interface DigestPayload {
  signals: SubscriberSignal[];
  collapsed: boolean;
  totalMatched: number;
}

export function collapseDigest(matched: SubscriberSignal[]): DigestPayload {
  if (matched.length > DIGEST_COLLAPSE_THRESHOLD) {
    return {
      signals: matched.slice(0, DIGEST_COLLAPSE_TOP_N),
      collapsed: true,
      totalMatched: matched.length,
    };
  }
  return { signals: matched, collapsed: false, totalMatched: matched.length };
}
