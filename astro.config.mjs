import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://farodelaserena.com',
  output: 'static',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en', 'zh', 'arn'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
