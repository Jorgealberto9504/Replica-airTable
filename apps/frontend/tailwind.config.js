/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./.index.css",
    "./src/**/*.{js,jsx,ts,tsx}" // 👈 esto incluye subcarpetas
  ],
  theme: {
    extend: {
      colors: {
        fondo: "#F0F3FA",
        verde: "#8AAEE0",
        azulMedio: "#638ECB",
        azulOscuro: "#395886",
      },
    },
  },
  plugins: [],
}

