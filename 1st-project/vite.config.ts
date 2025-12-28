import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  build: {
    outDir: './nodeserver/dist/',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    // viteSingleFile(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PWA Form App',
        short_name: 'FormApp',
        description:
          'A Progressive Web App with form submission and localStorage',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
