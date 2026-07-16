/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brandBlue: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae2fd',
          300: '#7ccafd',
          400: '#38aefc',
          500: '#0e94f3',
          600: '#0276d9',
          700: '#035eb1',
          800: '#075091',
          900: '#0c4378',
          950: '#082b4e',
        }
      }
    },
  },
  plugins: [],
}
