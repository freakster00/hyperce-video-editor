import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        space: {
          950: "#0B1423",
          900: "#111B2B",
          850: "#162233",
          800: "#1B2A3C",
          700: "#2B3B50",
          500: "#4F6075"
        },
        pulse: "#3F8D9A",
        cyanline: "#58BCCB",
        mint: "#20C98B",
        ember: "#FFD400",
        danger: "#FF5C7A",
        ink: "#F7FAFF",
        muted: "#9AA8BB"
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        pulse: "0 0 0 1px rgba(63,141,154,0.32), 0 0 34px rgba(88,188,203,0.22)",
        panel: "0 16px 44px rgba(0,0,0,0.28)"
      }
    }
  },
  plugins: []
};

export default config;
