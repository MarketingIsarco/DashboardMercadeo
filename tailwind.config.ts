import type { Config } from 'tailwindcss';

/**
 * Design tokens lifted verbatim from `dashboard-comercial-Final Junio.html`
 * so the ported UI keeps the exact palette the business already recognises.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f4f5f9',
        card: '#ffffff',
        border: '#e2e5ef',
        text: '#1a1a2e',
        dim: '#6a6a82',
        muted: '#9090a8',
        indigo: '#6366f1',
        gold: '#c9a96e',
        cyan: '#22d3ee',
        green: '#4ade80',
        red: '#f43f5e',
        orange: '#f97316',
        grid: '#eaedf5',
        accent: {
          DEFAULT: '#0e6680',
          soft: '#0e668014',
          border: '#0e6680aa',
          tint: '#0e668006',
          2: '#0e8899',
        },
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'],
      },
      fontSize: {
        '2xs': '10px',
        '3xs': '9px',
      },
    },
  },
  plugins: [],
};

export default config;
