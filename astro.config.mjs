import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://colonialighthouse.com',
  output: 'static',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en', 'zh', 'gn'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
