import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tristar: {
          orange: "#FF8200",
          peach: "#FFEAD5",
        },
      },
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        body: ["Open Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
