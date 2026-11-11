import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate entry and output keep this preview independent of the Casa website.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-cofein',
    rollupOptions: { input: ['cofein-preview.html'] },
  },
});
