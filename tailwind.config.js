/** @type {import('tailwindcss').Config} */

function rgbChannel(name) {
  return `rgb(var(${name}) / <alpha-value>)`
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: rgbChannel('--color-bg'),
        surface: rgbChannel('--color-surface'),
        border: rgbChannel('--color-border'),
        text: rgbChannel('--color-text'),
        foreground: rgbChannel('--color-text'),
        muted: rgbChannel('--color-muted'),
        primary: {
          DEFAULT: rgbChannel('--color-primary'),
          600: rgbChannel('--color-primary-600'),
          700: rgbChannel('--color-primary-700'),
          800: rgbChannel('--color-primary-800'),
        },
        success: rgbChannel('--color-success'),
        danger: rgbChannel('--color-danger'),
        warning: rgbChannel('--color-warning'),
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
}
