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
          950: "#07131F",
          900: "#0D202B",
          850: "#122A35",
          800: "#173641",
          700: "#28555F",
          500: "#5B828B"
        },
        pulse: "#FFD91A",
        cyanline: "#3A838D",
        mint: "#20C98B",
        ember: "#FFD91A",
        danger: "#FF5C7A",
        ink: "#F7FAFF",
        muted: "#A9BBC3"
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        pulse: "0 0 0 1px rgba(255,217,26,0.32), 0 0 34px rgba(58,131,141,0.26)",
        panel: "0 16px 44px rgba(0,0,0,0.28)"
      }
    }
  },
  plugins: []
};

export default config;
