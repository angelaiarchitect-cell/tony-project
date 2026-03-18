import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['tony-icon.svg', 'tony-icon-192.png', 'tony-icon-512.png'],
      manifest: {
        name: 'Tony - AI Workspace Assistant',
        short_name: 'Tony',
        description: 'Your AI workspace assistant powered by Claude. Email, calendar, Slack, budget, deadlines, meeting notes — all in one place.',
        theme_color: '#0F1923',
        background_color: '#0F1923',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'tony-icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'tony-icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'tony-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'tony-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
});
