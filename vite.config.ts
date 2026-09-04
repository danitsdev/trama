import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import localPuzzleApi from './vite.local-db.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localPuzzleApi()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
