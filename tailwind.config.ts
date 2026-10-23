import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172a36",
        sea: "#2a7774",
        sand: "#f3eee6",
        coral: "#d98569",
      },
      fontFamily: {
        sans: ["Arial", "Helvetica", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 32px rgba(25, 48, 59, .09)",
      },
    },
  },
  plugins: [],
};

export default config;
