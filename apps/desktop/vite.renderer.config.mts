import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  build: {
    outDir: '.vite/renderer/main_window',
  },
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
