/**
 * Colours follow meesho.com: #9F2089 action pink-purple, #570A57 wordmark,
 * #353543 / #616173 / #8B8BA3 text, #EAEAF2 hairlines, #038D63 green for
 * discounts and ratings, #FFE7FB soft pink.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff5fc',
          100: '#ffe7fb',
          200: '#f8c8ec',
          300: '#ee9ad8',
          400: '#d95fb9',
          500: '#bf3aa0',
          600: '#9f2089',
          700: '#861b74',
          800: '#6d1560',
          900: '#570a57',
        },
        ink: {
          50: '#f9f9fb',
          100: '#f3f3f8',
          200: '#eaeaf2',
          300: '#d0d0dc',
          400: '#8b8ba3',
          500: '#6e6e85',
          600: '#616173',
          700: '#4a4a5c',
          800: '#353543',
          900: '#23232e',
        },
        emerald: {
          50: '#e8f6f1',
          100: '#cdeee3',
          200: '#9fdcc7',
          300: '#63c3a3',
          400: '#2aa77e',
          500: '#06996d',
          600: '#038d63',
          700: '#037a56',
          800: '#026448',
          900: '#014a35',
        },
      },
      fontFamily: {
        sans: ['Mulish', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
