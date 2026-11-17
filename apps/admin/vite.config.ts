import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev` proxies API calls to a locally running API (npm run start:dev in apps/api).
// In Docker the built files are served by Caddy on the same origin as the API.
const API = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/graphql': API, '/api': API, '/auth': API },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 2000 },
});
