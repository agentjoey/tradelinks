import type { Config } from "tailwindcss";

const rgb = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: rgb("--c-bg"),
        surface: rgb("--c-surface"),
        surface2: rgb("--c-surface2"),
        ink: rgb("--c-ink"),
        muted: rgb("--c-muted"),
        faint: rgb("--c-faint"),
        line: "var(--c-line)",
        linestrong: "var(--c-linestrong)",
        signal: rgb("--c-signal"),
        urgent: rgb("--c-urgent"),
        calm: rgb("--c-calm"),
        chipbg: rgb("--c-chip-bg"),
        chipink: rgb("--c-chip-ink"),
        eyebrow: "var(--c-eyebrow)",
      },
      fontSize: {
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        meta: ["0.8125rem", { lineHeight: "1.25rem" }],
        body: ["1rem", { lineHeight: "1.6" }],
        lede: ["1.125rem", { lineHeight: "1.55" }],
        title: ["1.3125rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        headline: ["1.625rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px" },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-bar": {
          "0%,100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.55s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-bar": "pulse-bar 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
