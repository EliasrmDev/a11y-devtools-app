import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Split vendor chunks for better long-term caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/'))
            return 'vendor-react';
          if (id.includes('node_modules/react-router'))
            return 'vendor-router';
          if (id.includes('node_modules/@clerk/'))
            return 'vendor-clerk';
          if (id.includes('node_modules/@radix-ui/'))
            return 'vendor-radix';
        },
      },
    },
  },
})
