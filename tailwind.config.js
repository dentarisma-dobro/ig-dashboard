/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#151C22",
        panel: "#1B2530",
        line: "#2B3742",
        paper: "#EDEFEF",
        muted: "#8B98A5",
        accent: "#2F6FED",
        warn: "#F2994A",
        good: "#3FB68B",
      },
      fontFamily: {
        display: ["var(--font-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
