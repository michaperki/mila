
import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: ["./index.html","./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container:{ center:true, padding:"2rem", screens:{ "2xl":"1400px" } },
    extend:{},
  },
  plugins: [],
};
export default config;
