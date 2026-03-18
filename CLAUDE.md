# Tony — AI Workspace Assistant

## Architecture
- **Frontend**: React 18 + Vite + PWA (vite-plugin-pwa)
- **Backend**: Vercel serverless functions (`api/chat.js`, `api/google-auth.js`)
- **AI**: Claude Sonnet 4 with agentic tool-use loop (max 8 rounds)
- **Tools**: Defined in `lib/tools.js`, executed by `lib/tool-executor.js`
- **Design tokens**: Defined as `T` object at top of `src/TonyAssistant.jsx` (not CSS vars)

## Key Files
- `src/TonyAssistant.jsx` — Main UI (single-file component with all panels)
- `api/chat.js` — Agentic backend (Claude API + tool loop)
- `api/google-auth.js` — OAuth flow handler
- `lib/tools.js` — Tool definitions for Claude
- `lib/tool-executor.js` — Tool execution logic (Calendar, Sheets, Roku)
- `roku-bridge/server.js` — Local Express server for Roku ECP control
- `vite.config.js` — Build config with PWA manifest and workbox

## Integrations
- **Google Calendar + Sheets**: OAuth 2.0, refresh token stored in Vercel env
- **Roku**: Local bridge server (port 9090) exposed via Cloudflare tunnel
- **WhatsApp**: Message composition with clickable send links

## Deployment
- **Platform**: Vercel
- **Live URL**: https://tony-project-sand.vercel.app
- **GitHub**: angelaiarchitect-cell/tony-project
- **Env vars** (Vercel): ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, ROKU_BRIDGE_URL, ROKU_BRIDGE_KEY

## PWA
- Service worker configured with `navigateFallbackDenylist: [/^\/api\//]` — critical to avoid intercepting API routes
- Icons: 192x192, 512x512, apple-touch-icon (180x180) in `public/`

## Dev Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- Roku bridge: `cd roku-bridge && ROKU_IP=192.168.4.26 ROKU_BRIDGE_KEY=tony-roku-secret node server.js`
- Cloudflare tunnel: `npx cloudflared tunnel --url http://localhost:9090`

## Style
- Colors: Red (#E53935), Green (#00E676), Black (#0A0A0A), White
- Fonts: Inter (UI), JetBrains Mono (code)
- All styling is inline via design token object `T` — no CSS files

## Known Gotchas
- PWA service worker will cache aggressively — users may need to unregister old SW after changes
- Roku bridge + tunnel are ephemeral (stop on restart) — no persistent solution yet
- The `api/chat.js` must NOT include `mcp_servers` in the Anthropic API request body
- Vercel env vars use: `npx vercel env add VARNAME production --value "value" --yes`
- User's home network is 192.168.4.x-7.x (subnet /22), Roku at 192.168.4.26
