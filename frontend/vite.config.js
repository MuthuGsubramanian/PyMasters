import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
