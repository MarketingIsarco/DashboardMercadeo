import type { Config } from 'tailwindcss';

/**
 * Línea gráfica tomada del dashboard de contratos de Isarco: azul petróleo
 * (#073b52 → #0b5f7e → #18a3c5) con naranja de acento (#ff8a3d).
 * Los nombres de los tokens se conservan para no tocar los componentes.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#eef2f7',
        card: '#ffffff',
        panel2: '#f3f6fa',
        border: '#e2e8f0',
        text: '#1c2733',
        dim: '#64748b',
        muted: '#94a3b8',
        indigo: '#0b5f7e',
        gold: '#b7791f',
        cyan: '#18a3c5',
        green: '#12a56b',
        red: '#d6455a',
        orange: '#ff8a3d',
        pop: '#ff8a3d',
        grid: '#eef2f6',
        accent: {
          DEFAULT: '#0b5f7e',
          soft: '#0b5f7e14',
          border: '#0b5f7eaa',
          tint: '#0b5f7e06',
          2: '#18a3c5',
          d: '#073b52',
        },
      },
      backgroundImage: {
        grad: 'linear-gradient(135deg,#073b52 0%,#0b5f7e 55%,#18a3c5 100%)',
        'grad-head': 'linear-gradient(120deg,#05273a 0%,#0b4b66 60%,#0f6d8c 100%)',
      },
      boxShadow: {
        panel: '0 10px 30px -12px rgba(7,59,82,.25)',
        soft: '0 4px 14px -8px rgba(7,59,82,.2)',
        tab: '0 8px 18px -6px rgba(11,95,126,.7)',
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
