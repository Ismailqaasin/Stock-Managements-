import type { Config } from "tailwindcss";
export default {
  content: { relative: true, files: ["./src/**/*.{tsx,ts}"] },
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
