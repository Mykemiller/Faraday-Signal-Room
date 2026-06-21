"use client";

import type { Taxonomy, DraftRule } from "./types";

/**
 * Entry / preset gallery (§9.2): preset configurations as starting points
 * (preset-then-customize). Presets are templates only — activating ANY
 * configuration burns the meter or trial allowance; there is no free preset
 * tier (GF-3).
 */
export function PresetGallery({
  taxonomy,
  onApply,
}: {
  taxonomy: Taxonomy;
  onApply: (rules: DraftRule[]) => void;
}) {
  const presets = buildPresets(taxonomy);
  if (presets.length === 0) return null;

  return (
    <section>
      <h2 className="font-serif text-xl">Start from a preset</h2>
      <p className="text-sm text-forest/70">Templates you can customize before activating.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {presets.map((p) => (
          <button
            key={p.title}
            onClick={() => onApply(p.rules)}
            className="rounded-lg border border-cream bg-white p-4 text-left hover:border-gold"
          >
            <p className="font-medium text-forest">{p.title}</p>
            <p className="mt-1 text-sm text-forest/70">{p.blurb}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

interface Preset {
  title: string;
  blurb: string;
  rules: DraftRule[];
}

function buildPresets(taxonomy: Taxonomy): Preset[] {
  const presets: Preset[] = [];
  let k = 0;
  const key = () => `p${++k}`;

  const firstThemes = taxonomy.themes.slice(0, 2);
  if (firstThemes.length > 0) {
    presets.push({
      title: "Macro watch",
      blurb: "A broad daily read across the biggest Theaters.",
      rules: firstThemes.map((t) => ({
        key: key(),
        dimension: "theme" as const,
        refId: t.theme_code,
        label: t.name,
        frequency: "daily" as const,
        delivery_rail: "email_digest" as const,
      })),
    });
  }

  if (taxonomy.companies.length > 0) {
    presets.push({
      title: "Company tracker",
      blurb: "Follow a starter set of companies, real-time.",
      rules: taxonomy.companies.slice(0, 3).map((c) => ({
        key: key(),
        dimension: "company" as const,
        refId: c.company_id,
        label: c.name,
        frequency: "realtime" as const,
        delivery_rail: "in_app" as const,
      })),
    });
  }

  return presets;
}
