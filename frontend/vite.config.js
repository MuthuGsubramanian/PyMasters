import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendOrigin = globalThis.process?.env?.PYMASTERS_BACKEND_ORIGIN || 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors out of the entry chunk so the public landing page
        // doesn't ship the whole dashboard's dependencies. react-markdown +
        // framer-motion in particular were landing in the eager entry chunk via
        // Layout; isolating them lets the browser cache them separately and keeps
        // the initial download smaller. (xlsx is already dynamically imported.)
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion': ['framer-motion'],
          'markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
})
