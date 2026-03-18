// ─── TONY ROKU BRIDGE ───
// Local server that runs on your home network to control Roku devices.
// Tony's cloud backend sends commands here, and this bridge forwards them to the Roku.
//
// SETUP:
// 1. Find your Roku's IP: Settings → Network → About on your Roku
// 2. Set ROKU_IP below or in .env
// 3. Run: npm install && npm start
// 4. Expose via tunnel: npx cloudflared tunnel --url http://localhost:9090
//    Or: npx ngrok http 9090
// 5. Copy the tunnel URL to Vercel env var: ROKU_BRIDGE_URL

import express from "express";

const app = express();
app.use(express.json());

// Configuration
const ROKU_IP = process.env.ROKU_IP || "192.168.1.100";
const ROKU_PORT = 8060;
const BRIDGE_KEY = process.env.ROKU_BRIDGE_KEY || "tony-roku-secret";
const PORT = process.env.PORT || 9090;

const ROKU_BASE = `http://${ROKU_IP}:${ROKU_PORT}`;

// ─── Auth middleware ───
function auth(req, res, next) {
  const key = req.headers["x-bridge-key"];
  if (key !== BRIDGE_KEY) {
    return res.status(401).json({ error: "Invalid bridge key" });
  }
  next();
}

// ─── Helper: fetch from Roku ───
async function rokuFetch(path, method = "GET") {
  const resp = await fetch(`${ROKU_BASE}${path}`, { method });
  if (method === "POST" && (resp.status === 200 || resp.status === 202)) {
    return { success: true };
  }
  const text = await resp.text();
  return { success: resp.ok, status: resp.status, body: text };
}

// ─── Helper: parse XML simply ───
function parseSimpleXML(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function parseAppsXML(xml) {
  const regex = /<app id="(\d+)"[^>]*>([^<]+)<\/app>/gi;
  const apps = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    apps.push({ id: match[1], name: match[2] });
  }
  return apps;
}

// ─── Routes ───

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", roku_ip: ROKU_IP, bridge: "tony-roku-bridge v1.0" });
});

// Launch app
app.post("/roku/launch", auth, async (req, res) => {
  try {
    const { app_id, app_name, content_id } = req.body;
    let path = `/launch/${app_id}`;
    if (content_id) path += `?contentId=${encodeURIComponent(content_id)}`;
    const result = await rokuFetch(path, "POST");
    res.json({
      success: true,
      message: `Launched ${app_name || `app ${app_id}`} on Roku`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send keypress
app.post("/roku/keypress", auth, async (req, res) => {
  try {
    const { key } = req.body;
    const result = await rokuFetch(`/keypress/${key}`, "POST");
    res.json({ success: true, key, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search content
app.post("/roku/search", auth, async (req, res) => {
  try {
    const { query, type } = req.body;
    let path = `/search/browse?keyword=${encodeURIComponent(query)}`;
    if (type) path += `&type=${type}`;
    const result = await rokuFetch(path, "POST");
    res.json({
      success: true,
      message: `Searching Roku for "${query}"`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Type text (character by character)
app.post("/roku/type", auth, async (req, res) => {
  try {
    const { text } = req.body;
    for (const char of text) {
      await rokuFetch(`/keypress/Lit_${encodeURIComponent(char)}`, "POST");
      await new Promise((r) => setTimeout(r, 100)); // Small delay between chars
    }
    res.json({ success: true, message: `Typed "${text}" on Roku`, characters: text.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get status (active app + device info)
app.get("/roku/status", auth, async (req, res) => {
  try {
    const [activeApp, deviceInfo, apps] = await Promise.all([
      rokuFetch("/query/active-app"),
      rokuFetch("/query/device-info"),
      rokuFetch("/query/apps"),
    ]);

    const activeAppNames = parseAppsXML(activeApp.body || "");
    const installedApps = parseAppsXML(apps.body || "");
    const modelName = parseSimpleXML(deviceInfo.body || "", "model-name");
    const softwareVersion = parseSimpleXML(deviceInfo.body || "", "software-version");
    const deviceName = parseSimpleXML(deviceInfo.body || "", "user-device-name");

    res.json({
      success: true,
      active_app: activeAppNames[0] || null,
      device: {
        name: deviceName[0] || "Roku",
        model: modelName[0] || "Unknown",
        software: softwareVersion[0] || "Unknown",
      },
      installed_apps: installedApps,
      total_apps: installedApps.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: `Cannot reach Roku at ${ROKU_IP}:${ROKU_PORT}. Is the IP correct?` });
  }
});

// ─── Auto-discover Roku on network ───
app.get("/roku/discover", async (req, res) => {
  res.json({
    message: "To find your Roku IP: Go to Roku Settings → Network → About",
    current_ip: ROKU_IP,
    tip: "Update ROKU_IP in your .env file and restart the bridge",
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║       TONY ROKU BRIDGE v1.0               ║
╠═══════════════════════════════════════════╣
║  Bridge URL:  http://localhost:${PORT}       ║
║  Roku IP:     ${ROKU_IP.padEnd(26)}║
║  Roku Port:   ${String(ROKU_PORT).padEnd(26)}║
╠═══════════════════════════════════════════╣
║  Next steps:                              ║
║  1. Expose with tunnel:                   ║
║     npx cloudflared tunnel                ║
║       --url http://localhost:${PORT}         ║
║  2. Copy tunnel URL to Vercel env:        ║
║     ROKU_BRIDGE_URL=https://your.tunnel   ║
║  3. Tell Tony "Launch Netflix" 🎬         ║
╚═══════════════════════════════════════════╝
  `);
});
