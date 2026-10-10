import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Tailwind v4 runs as a Vite plugin, so no tailwind.config or PostCSS file is needed.
  plugins: [react(), tailwindcss()],
  server: {
    // Forward API calls to the FastAPI backend. "backend" is the Docker Compose
    // service name; use http://localhost:8000 when running outside Docker.
    proxy: { '/api': 'http://backend:8000' },
    // Polling is required for hot reload to see file changes through Docker bind mounts on Windows.
    watch: { usePolling: true },
  },
})
