/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#f4f6f8",
        card: "#ffffff",
        line: "#e6e8ec",
        hair: "#eef0f3",
        ink: "#14171c",
        sub: "#5a6270",
        muted: "#8a929e",
        accent: { DEFAULT: "#2a78d6", soft: "#eaf2fc", dark: "#1c5cab" },
        up: "#0b7a35",
        down: "#c93434",
        warn: "#a35f00",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        pop: "0 8px 28px rgba(20, 23, 28, 0.12)",
      },
    },
  },
  plugins: [],
};
