import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        pig: {
          50: '#fff1f5',
          100: '#ffe4ec',
          200: '#fecdd9',
          400: '#fb7196',
          500: '#f43f75',
          600: '#e11d5c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
