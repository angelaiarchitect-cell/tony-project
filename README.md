# TONY — AI Workspace Assistant

> Powered by Claude · v3.1

Tony is a full-featured AI workspace assistant with a Stark-inspired personality. He manages email, calendar, Slack, WhatsApp, budgets, deadlines, meeting notes, and a dedicated Site 11250 project folder — all from one interface with voice support.

---

## PROJECT STRUCTURE

```
tony-project/
├── api/
│   └── chat.js              # Vercel serverless function (API proxy)
├── public/
│   └── tony-icon.svg        # App icon (SVG)
├── src/
│   ├── main.jsx             # React entry point
│   └── TonyAssistant.jsx    # Main app component (all-in-one)
├── .env.example              # Environment variables template
├── .gitignore
├── index.html                # HTML entry point
├── package.json
├── server.js                 # Local Express proxy server (optional)
├── vercel.json               # Vercel deployment config
├── vite.config.js            # Vite + PWA plugin config
└── README.md                 # This file
```

---

## QUICK START (LOCAL DEVELOPMENT)

```bash
# 1. Install dependencies
npm install

# 2. Set up your API key
cp .env.example .env
# Edit .env and add your Anthropic API key

# 3. Start dev server
npm run dev

# 4. Open http://localhost:5173
```

For local dev, Vite will proxy `/api/chat` requests. Add this to `vite.config.js` if needed:

```js
server: {
  proxy: {
    '/api': 'http://localhost:3001'
  }
}
```

Then run `node server.js` in a second terminal for the API proxy.

---

## DEPLOY TO VERCEL (RECOMMENDED)

This is the recommended deployment path. It gives Tony a real HTTPS URL, enables PWA installation, and handles the API proxy via serverless functions.

```bash
# 1. Install Vercel CLI if you haven't
npm i -g vercel

# 2. Deploy
vercel

# 3. Set the API key as an environment variable in Vercel
vercel env add ANTHROPIC_API_KEY

# 4. Redeploy to pick up the env var
vercel --prod
```

Or deploy via Vercel Dashboard:
1. Push this project to a Git repo
2. Import it in vercel.com/new
3. Add `ANTHROPIC_API_KEY` in Settings → Environment Variables
4. Deploy

---

## PWA DESKTOP INSTALLATION

Once deployed to a real HTTPS URL (e.g., Vercel):

### Chrome / Edge
1. Visit your Tony URL
2. Click the install icon (⊕) in the address bar
3. Click "Install" → Tony gets its own window and desktop icon
4. Pin to taskbar/dock for one-click access

### macOS Safari
1. Visit your Tony URL
2. File → Add to Dock

---

## MOBILE VOICE — "HEY TONY"

### iPhone (Siri Shortcuts)
1. Open Shortcuts app → New Shortcut
2. Add action → "Open URL" → paste your Tony deployment URL
3. Name it "Tony"
4. Say **"Hey Siri, Tony"** to launch
5. Tap the 🎤 mic button to speak

### Android (Google Assistant)
1. Google Assistant → Settings → Routines
2. Create routine → Starter: custom phrase **"Hey Tony"**
3. Action: Open URL → your Tony deployment URL
4. Say **"Hey Google, Hey Tony"** to launch
5. Tap 🎤 to speak

---

## FEATURES

### Core Integrations
- **Gmail** (MCP) — search, read, prioritize emails
- **Google Calendar** (MCP) — events, deadlines, bill reminders
- **Slack** (MCP) — channels, messages, search
- **WhatsApp** (wa.me links) — compose and send via WhatsApp Web

### Productivity Modules
- **💰 Budget & Bills** — expense tracking, bill due dates, payment reminders, spending categories
- **⏰ Deadlines** — task management with priority levels, project tags, completion tracking
- **📝 Meeting Notes** — structured notes with attendees, discussion, action items + 6 pre-built templates
- **📁 Site 11250** — dedicated project folder with files, deadlines, and notes

### Meeting Note Templates (Site 11250)
- 🔄 Daily Standup
- 🦺 Safety Meeting
- 📊 Progress Report
- 🤝 Subcontractor Coordination
- 🔍 Inspection Debrief
- 📝 General Meeting

### Voice
- **Speech-to-text** input via browser Web Speech API
- **Text-to-speech** output tuned for confident, polished tone (JARVIS-style British voice priority)
- Wake word "Hey Tony" auto-stripped from voice input
- Voice pitch: 0.88 (lower, authoritative), Rate: 1.05 (slightly fast, sharp)

### Personality
Tony speaks with dry confidence and wit — Stark-inspired energy. Efficient, self-aware, loyal. Calls you "boss" occasionally. No corporate fluff.

### Safety
- Delete protection: all destructive actions require explicit confirmation
- Payment block: Tony cannot make financial transactions
- WhatsApp: always requires user click to send via wa.me link

---

## SLACK INTEGRATION

Tony has been introduced in the `#ai-assistant` channel in your Slack workspace. Users can interact with Tony by mentioning him or starting messages with "Tony."

For a deeper Slack bot integration (where Tony auto-responds to messages), you would need to:
1. Create a Slack App at api.slack.com
2. Enable Event Subscriptions pointing to a webhook endpoint
3. Add a `/api/slack-webhook.js` serverless function that receives Slack events and calls the Anthropic API
4. Install the app to your workspace

This is a follow-up enhancement that Claude Code can help build.

---

## ICON GENERATION

The `public/tony-icon.svg` is the base icon. For PWA you need PNG versions. Generate them with:

```bash
# Using sharp (install: npm i -D sharp-cli)
npx sharp -i public/tony-icon.svg -o public/tony-icon-192.png --width 192 --height 192
npx sharp -i public/tony-icon.svg -o public/tony-icon-512.png --width 512 --height 512
```

Or use any SVG-to-PNG converter. The PWA manifest in `vite.config.js` references these files.

---

## ENVIRONMENT VARIABLES

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key from console.anthropic.com |

---

## TECH STACK

- **Frontend**: React 18 + Vite
- **PWA**: vite-plugin-pwa (Workbox)
- **Backend**: Vercel Serverless Functions (or Express proxy)
- **AI**: Claude Sonnet 4 via Anthropic API
- **Integrations**: MCP (Gmail, Calendar, Slack)
- **Voice**: Web Speech API (SpeechRecognition + SpeechSynthesis)

---

## CLAUDE CODE INSTRUCTIONS

When opening this project in Claude Code, ask it to:

1. `npm install`
2. Generate PNG icons from the SVG: `npx sharp -i public/tony-icon.svg -o public/tony-icon-192.png --width 192` (and 512)
3. Add the Vite dev server proxy for `/api` to `vite.config.js`
4. Create a `.env` file with your Anthropic API key
5. Run `npm run dev` to test locally
6. Deploy to Vercel with `vercel` CLI
7. Set `ANTHROPIC_API_KEY` in Vercel environment variables
8. Test PWA install from the deployed URL

---

## LICENSE

Private project. All rights reserved.
