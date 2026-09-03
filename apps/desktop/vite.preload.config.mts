import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/preload/index.ts',
      fileName: () => 'preload.js',
      formats: ['cjs'],
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron', /^node:/],
    },
  },
});
