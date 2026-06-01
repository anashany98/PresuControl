import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { frontmanPlugin } from '@frontman-ai/vite'

export default defineConfig({
  plugins: [react(), frontmanPlugin()],
  server: {
    // WebSocket support is intentionally disabled (ws: false) because the app uses
    // SSE via EventSource. To enable WS for future WebSocket endpoints, add ws: true
    // to the '/api' proxy config below.
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
