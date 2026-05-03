/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e3a5f',
          50:  '#f0f4f8',
          100: '#d9e2ec',
          200: '#b3c6d9',
          300: '#8aaac5',
          400: '#618db0',
          500: '#4a6fa5',
          600: '#2d5282',
          700: '#1e3a5f',
          800: '#142845',
          900: '#0a1829',
        },
        accent: {
          DEFAULT: '#F59E0B',
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
      },
    },
  },
  plugins: [],
};
