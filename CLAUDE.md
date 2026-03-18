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
- **Google Calendar + Sheets + Gmail**: OAuth 2.0, refresh token stored in Vercel env
- **Gmail**: `lib/gmail.js` — list, read, search, draft, send emails + download/analyze attachments via REST API. Scope: `gmail.modify`
  - Attachment support: CSV, TSV, JSON, TXT, HTML parsed directly; images as base64; binary (PDF, XLSX) returns metadata
  - Tools: `gmail_get_attachment` (single file), `gmail_analyze_attachments` (all files on an email)
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

## Mobile Responsive
- Uses `useIsMobile()` hook with `window.matchMedia` (breakpoint: 768px) — NOT CSS media queries
- Mobile: sidebar hidden, replaced by bottom tab bar (6 tabs) + hamburger slide-over menu
- Desktop: sidebar renders normally with collapsible toggle
- All panels accept `isMobile` prop for responsive padding (24→16), grids (3col→2col), and sizing
- `MessageBubble` takes `isMobile` prop for wider bubbles (88% vs 75%) and smaller avatars
- Quick actions limited to 4 on mobile (vs 8 on desktop)
- Bottom tab bar uses `env(safe-area-inset-bottom)` for iPhone home indicator
- `viewport-fit=cover` in index.html required for iOS safe area support
- PWA shortcuts in manifest for Android long-press actions
- URL param `?view=chat` support for shortcut deep-linking

## Voice (Jarvis Mode)
- TTS uses Web Speech API with Jarvis-like voice selection (British male preferred: Daniel > UK English > any male)
- Voice settings: rate 0.92, pitch 0.82 — deeper and more deliberate than default
- When tools are executed, speaks brief confirmations ("Yes, boss", "On it", "Done") instead of reading full response
- `CONFIRMATIONS` array at top of TonyAssistant.jsx contains the randomized short phrases
- `speakConfirmation()` method on voice hook for tool-action responses, `speak()` for normal text responses
- System prompt instructs Claude to keep action confirmations to ONE line max

## Image/Screenshot Analysis
- Users can attach images (email screenshots, documents) via the image button in chat input
- Images sent as base64 in Claude API content array: `[{type: "image", source: {type: "base64", ...}}, {type: "text", text: "..."}]`
- `handleImageUpload()` reads file as DataURL, stores in `imagePreview` state
- `sendWithImage()` sends the multi-part content to the API
- `MessageBubble` renders image thumbnails for messages with `hasImage` flag
- On mobile, `capture="environment"` allows direct camera capture
- System prompt instructs Claude to analyze screenshots with: brief context, key points, suggested response

## PWA Install
- `usePWAInstall()` hook captures `beforeinstallprompt` event
- Shows green "Install" button in header when install prompt is available
- Detects if already installed via `display-mode: standalone` media query
- Works on Chrome/Edge (Android + desktop); iOS uses "Add to Home Screen" in Safari

## Style
- Colors: Red (#E53935), Green (#00E676), Black (#0A0A0A), White
- Fonts: Inter (UI), JetBrains Mono (code)
- All styling is inline via design token object `T` — no CSS files
- Responsive approach: React state (useIsMobile hook), NOT CSS media queries — because all styles are inline

## Known Gotchas
- PWA service worker will cache aggressively — users may need to unregister old SW after changes
- Roku bridge + tunnel are ephemeral (stop on restart) — no persistent solution yet
- The `api/chat.js` must NOT include `mcp_servers` in the Anthropic API request body
- Vercel env vars use: `npx vercel env add VARNAME production --value "value" --yes`
- User's home network is 192.168.4.x-7.x (subnet /22), Roku at 192.168.4.26
