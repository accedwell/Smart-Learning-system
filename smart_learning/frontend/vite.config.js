import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the backend API (smart_learning/backend) runs on :4000
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
})
