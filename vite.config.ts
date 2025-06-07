import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Exclude FFmpeg packages from optimization to prevent worker issues
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  resolve: {
    dedupe: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  server: {
    // Enable cross-origin isolation headers needed for SharedArrayBuffer
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    // Ensure proper handling of workers in production build
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@ffmpeg')) {
            return 'ffmpeg';
          }
        },
      },
    },
  },
})
