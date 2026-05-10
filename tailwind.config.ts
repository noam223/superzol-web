import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fdf2f2',
          100: '#fce4e4',
          200: '#f9c9c9',
          300: '#f49898',
          400: '#ec5757',
          500: '#BF2C2C',
          600: '#a82424',
          700: '#8f1d1d',
          800: '#761818',
          900: '#5e1212',
        },
        beige: {
          bg:     '#DAD1CA',
          card:   '#E9D8C5',
          border: '#B6AB9C',
          dark:   '#4F483F',
          muted:  '#8a7f75',
          divider:'#D6CDBE',
        },
      },
      fontFamily: {
        sans: ['Heebo', 'Rubik', 'sans-serif'],
        rubik: ['Rubik', 'Heebo', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
export default config
