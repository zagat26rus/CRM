/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0e0f10",
        surface: "#141518",
        border: "#1f2024",
        text: "#e7e7ea",
        muted: "#a1a1aa",
        primary: {
          DEFAULT: "#f5c400",
          600: "#e5b700",
          700: "#c89f00",
          800: "#9e7e00"
        },
        success: "#23c55e",
        danger: "#ef4444",
        warning: "#f59e0b",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(0,0,0,.35)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    },
  },
  plugins: [],
}
