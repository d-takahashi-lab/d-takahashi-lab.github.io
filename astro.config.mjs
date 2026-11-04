import { defineConfig } from 'astro/config';
// Actions sets both values automatically for project pages and user pages.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
  output: 'static',
  // Keep source photographs private; publish only selected, optimized assets.
  publicDir: './site-public',
  trailingSlash: 'always',
});
