import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#141925",
        border: "#222a3a",
        ink: "#e6e9ef",
        muted: "#8b94a7",
      },
    },
  },
  plugins: [],
};
export default config;
