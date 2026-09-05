import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.js',
      formats: ['cjs'],
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron', 'robotjs', /^node:/],
      output: {
        entryFileNames: 'main.js',
      },
    },
    ssr: true,
  },
  ssr: {
    noExternal: [/^(?!robotjs$).+/],
  },
});
