import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['tony-icon.svg', 'tony-icon-192.png', 'tony-icon-512.png', 'apple-touch-icon.png', 'tony-cover.jpg'],
      manifest: {
        name: 'Tony - AI Workspace Assistant',
        short_name: 'Tony',
        description: 'Your AI workspace assistant powered by Claude. Email, calendar, Slack, budget, deadlines, meeting notes — all in one place.',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
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
        ],
        shortcuts: [
          {
            name: 'Quick Chat',
            short_name: 'Chat',
            description: 'Send Tony a quick message',
            url: '/?view=chat',
            icons: [{ src: 'tony-icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'My Schedule',
            short_name: 'Schedule',
            description: 'Check your calendar',
            url: '/?view=chat',
            icons: [{ src: 'tony-icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
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
