import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Stick Reels uses its own ports (API 5001, client 5175) so it can run beside other projects.
// API_URL points the client at a server elsewhere.
const api = process.env.API_URL || 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': api,
      '/media': api,
    },
  },
  preview: { port: 4175 },
});
