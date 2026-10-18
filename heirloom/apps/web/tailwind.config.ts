import type { Config } from "tailwindcss";

// Design tokens. Components use these names only; no hex values outside this file and globals.css.
const navy = { 950: "#0B1238", 900: "#121C4E", 600: "#566079" };
const red = { 600: "#D0271D", 700: "#A81E16" };
const pill = {
  ok: "#DDF3E5",
  "ok-fg": "#116632",
  warn: "#FCE9C8",
  "warn-fg": "#8A4308",
  bad: "#FBE3E3",
  "bad-fg": "#9F1818",
  info: "#E1E9FD",
  "info-fg": "#1740B5",
  mute: "#E8ECF6",
  "mute-fg": "#3C4766",
};
const team = { time: "#8B5CF6", payroll: "#5B6BD6", benefits: "#0F9F90" };

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: { nav: "900px" },
      colors: {
        navy,
        red,
        page: "#F4F6FB",
        card: "#FFFFFF",
        line: "#D9DEEB",
        pill,
        team,
        tile: { red: "#B91C1C", amber: "#FAD9A1", green: pill.ok },

        // Legacy aliases onto the new palette, removed once every page is migrated.
        adp: { red: red[600], "red-bright": red[600], "red-dark": red[700], navy: navy[900], "navy-700": navy[600], "navy-50": pill.mute },
        surface: { DEFAULT: "#FFFFFF", muted: "#F4F6FB" },
        border: "#D9DEEB",
        muted: navy[600],
        status: { good: pill["ok-fg"], warn: pill["warn-fg"], critical: pill["bad-fg"], info: pill["info-fg"], neutral: pill["mute-fg"] },
      },
      fontFamily: {
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
      },
      fontSize: { body: ["15px", "1.55"] },
      borderRadius: { card: "20px", btn: "12px" },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
    },
  },
  plugins: [],
};

export default config;
