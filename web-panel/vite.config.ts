import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

export default defineConfig({
  // GitHub Actions build sets VITE_BASE=/sms/ (project pages).
  // Local dev / Electron / server build default to root.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})