import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        "surface-2": "hsl(var(--surface-2) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        fg: "hsl(var(--fg) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-fg": "hsl(var(--accent-fg) / <alpha-value>)",
        info: "hsl(var(--info) / <alpha-value>)",
        good: "hsl(var(--good) / <alpha-value>)",
        warn: "hsl(var(--warn) / <alpha-value>)",
        bad: "hsl(var(--bad) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.9rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--accent) / 0.25), 0 8px 40px -12px hsl(var(--accent) / 0.35)",
        soft: "0 1px 2px hsl(var(--shadow) / 0.4), 0 8px 30px -12px hsl(var(--shadow) / 0.5)",
        lift: "0 20px 60px -20px hsl(var(--shadow) / 0.7)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-ring": { "0%": { transform: "scale(0.9)", opacity: "0.7" }, "70%,100%": { transform: "scale(1.6)", opacity: "0" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        sheen: { from: { transform: "translateX(-150%) skewX(-18deg)" }, to: { transform: "translateX(250%) skewX(-18deg)" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite",
        float: "float 6s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
        sheen: "sheen 2.6s cubic-bezier(0.16,1,0.3,1) infinite",
      },
    },
  },
  plugins: [],
};
export default config;
