import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.cjs',
      formats: ['cjs'],
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron', 'robotjs', /^node:/],
      output: {
        entryFileNames: 'main.cjs',
      },
    },
    ssr: true,
  },
  ssr: {
    noExternal: [/^(?!robotjs$).+/],
  },
});
