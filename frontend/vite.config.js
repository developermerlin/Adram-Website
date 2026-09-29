import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Django API address for the dev proxy; set VITE_PROXY_TARGET to use another port.
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    hmr: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Uploaded files (profile pictures) served by Django; some API responses give /media/... paths.
      '/media': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  publicDir: 'public',
  base: '/',
})
