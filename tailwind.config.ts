import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#faf6ff',
          100: '#f0e6ff',
          200: '#e0ccff',
          300: '#cca8f6',
          400: '#b88aef',
          500: '#a070e0',
          600: '#8a55c8',
          700: '#7242a8',
          800: '#5a3486',
          900: '#3d2360',
        },
      },
      fontFamily: {
        sans: [
          'PingFang SC',
          '"Microsoft YaHei"',
          'Helvetica Neue',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
