import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Honour PORT so the dev server can move off 5173 when another project has it.
  server: { port: Number(process.env.PORT) || 5173 },
})
