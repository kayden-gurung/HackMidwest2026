import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // BACKEND_URL lets you run Vite outside Docker (e.g. http://localhost:8000). See .env.example.
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: { '/api': env.BACKEND_URL || 'http://backend:8000' },
      watch: { usePolling: true, ignored: ['**/*.tsbuildinfo'] },
    },
  }
})
