import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000',
      '/socket.io': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
