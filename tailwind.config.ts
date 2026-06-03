import type { Config } from "tailwindcss";

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
        ink: "#08090c",
        surface: "#0e1015",
        surface2: "#13161d",
        line: "rgba(233,228,217,0.10)",
        paper: "#ECE7DB",
        muted: "#8b8f9a",
        faint: "#5a5f6b",
        signal: "#E8B44A",
        urgent: "#FF5A4D",
        watch: "#E8B44A",
        calm: "#4FD1C5",
      },
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
