import type { Config } from "tailwindcss";

const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: c("background"),
        foreground: c("foreground"),
        card: { DEFAULT: c("card"), foreground: c("foreground") },
        muted: { DEFAULT: c("muted"), foreground: c("muted-foreground") },
        secondary: { DEFAULT: c("muted"), foreground: c("foreground") },
        border: c("border"),
        input: c("input"),
        ring: c("ring"),
        primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
        destructive: { DEFAULT: c("destructive"), foreground: c("foreground") },
        success: { DEFAULT: c("success"), foreground: c("success-foreground") },
        priority: {
          1: c("priority-1"),
          2: c("priority-2"),
          3: c("priority-3"),
          4: c("priority-4"),
          5: c("priority-5"),
        },
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
