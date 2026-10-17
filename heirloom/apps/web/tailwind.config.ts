import type { Config } from "tailwindcss";

// Theme tokens are copied exactly from SPEC §18. Don't add colors here.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        adp: {
          red: "#D0271D",
          "red-bright": "#EE2722",
          "red-dark": "#A81E16",
          navy: "#121C4E",
          "navy-700": "#2E3A6E",
          "navy-50": "#EEF0F6",
        },
        surface: { DEFAULT: "#FFFFFF", muted: "#F5F6F9" },
        border: "#DDE0E8",
        muted: "#5B6278",
        status: {
          good: "#16A34A",
          warn: "#D97706",
          critical: "#B91C1C",
          info: "#2563EB",
          neutral: "#6B7280",
        },
        team: { payroll: "#2E3A6E", benefits: "#0D9488", time: "#7C3AED" },
      },
      fontFamily: { sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "8px" },
    },
  },
  plugins: [],
};

export default config;
