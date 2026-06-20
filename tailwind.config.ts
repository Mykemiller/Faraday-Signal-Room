import type { Config } from "tailwindcss";

// Brand tokens are locked by the spec (§9.1). Do not invent new colors.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: "#1C3424", // Primary surface / headers
        gold: "#C4922A", // Accent, active state, eyebrow labels
        cream: "#EEE6DA", // Backgrounds, cards
        "warm-white": "#F8F5F0", // Backgrounds
        sage: "#8CA68A", // Secondary accents
        ink: "#1A1A1A",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "IBM Plex Serif", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
