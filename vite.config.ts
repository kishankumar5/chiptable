import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages serves from /<repo>/, so the build needs to know its prefix.
  // Vercel, Netlify and local dev all serve from the root and need nothing.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Keep the realtime client out of the first paint path.
        manualChunks: { supabase: ['@supabase/supabase-js'] },
      },
    },
  },
});
