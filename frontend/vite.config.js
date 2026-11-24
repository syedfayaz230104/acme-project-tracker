import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks cache well across deployments.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@mui/icons-material')) return 'vendor-icons'
          if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    exclude: ['node_modules/**', 'e2e/**'],
    coverage: {
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**'],
    },
  },
})
