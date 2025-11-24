import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // For biodata mode, build into dist/biodata subfolder
  const outDir = mode === 'biodata' ? 'dist/biodata' : 'dist'

  return {
    plugins: [react()],
    base: env.VITE_APP_BASE || '/ebcc/',
    build: {
      outDir,
      emptyOutDir: mode !== 'biodata', // Don't clear dist when building biodata
    }
  }
})
