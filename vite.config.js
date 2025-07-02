import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/client',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  }
}) 