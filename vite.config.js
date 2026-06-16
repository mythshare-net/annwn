import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build the game source in src/ into ONE self-contained index.html.
// `base: './'` keeps the artifact working both at /annwn/ on GitHub Pages and from file://.
// viteSingleFile inlines all JS/CSS so there are no external chunks to fetch.
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
