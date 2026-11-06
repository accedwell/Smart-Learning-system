import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // the backend API (smart_learning/backend) runs on :4000 unless API_URL says otherwise
  // (set it in frontend/.env, e.g. API_URL=http://localhost:4001, when 4000 is taken)
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      // reachable from phones on the same network too: the mobile app's "Join class" opens the
      // online classroom here, in the phone's browser
      host: true,
      proxy: { '/api': env.API_URL || 'http://localhost:4000' },
    },
  }
})
