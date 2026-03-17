import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        neumorph: {
          bg: "#EBECF0",
          text: "#A0A0A0",
          textTitle: "#6B6B6B",
          shadowDark: "#BABECC",
          shadowLight: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["var(--font-round)", "ui-rounded", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // 돌출 (Outer) - 카드, 버튼 기본
        neumorphOut: "6px 6px 12px #BABECC, -6px -6px 12px #FFFFFF",
        // 함몰 (Inner) - 입력창
        neumorphIn: "inset 4px 4px 8px #BABECC, inset -4px -4px 8px #FFFFFF",
        // 버튼 클릭 시 눌린 느낌
        neumorphPressed: "inset 3px 3px 6px #BABECC, inset -3px -3px 6px #FFFFFF",
        // 강한 돌출 (정산 카드 등)
        neumorphOutLg: "8px 8px 16px #BABECC, -8px -8px 16px #FFFFFF",
      },
      borderRadius: {
        neumorph: "1rem",
        neumorphLg: "1.25rem",
      },
      accentColor: {
        "neumorph-textTitle": "#6B6B6B",
      },
    },
  },
  plugins: [],
};
export default config;
