// ─── ROKU CONTROL ───
// Communicates with the local Roku Bridge server to control Roku devices.
// The bridge must be running on the same network as the Roku.

const APP_IDS = {
  netflix: 12,
  youtube: 837,
  hulu: 2285,
  "disney+": 291097,
  "disney plus": 291097,
  "amazon prime video": 13,
  "amazon prime": 13,
  "prime video": 13,
  "hbo max": 61322,
  "max": 61322,
  peacock: 593099,
  "apple tv+": 551012,
  "apple tv": 551012,
  "paramount+": 291097,
  spotify: 22297,
  plex: 13535,
  tubi: 41468,
  "pluto tv": 74519,
  crunchyroll: 2595,
  twitch: 50539,
};

const KEY_MAP = {
  play: "Play",
  pause: "Play", // Play toggles pause
  home: "Home",
  back: "Back",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  select: "Select",
  replay: "InstantReplay",
  info: "Info",
  rev: "Rev",
  fwd: "Fwd",
  volume_up: "VolumeUp",
  volume_down: "VolumeDown",
  volume_mute: "VolumeMute",
  power_off: "PowerOff",
  power_on: "PowerOn",
};

async function bridgeFetch(path, options = {}) {
  const bridgeUrl = process.env.ROKU_BRIDGE_URL;
  const bridgeKey = process.env.ROKU_BRIDGE_KEY;

  if (!bridgeUrl) {
    return {
      success: false,
      error: "Roku bridge not configured. Set ROKU_BRIDGE_URL in environment variables.",
      setup_instructions: "Run the roku-bridge server on your home network and expose it via tunnel. See roku-bridge/README for setup.",
    };
  }

  const resp = await fetch(`${bridgeUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Key": bridgeKey || "",
      ...options.headers,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Roku bridge error (${resp.status}): ${text}`);
  }

  return await resp.json();
}

export async function launchApp({ app_name, content_id }) {
  const normalized = app_name.toLowerCase().trim();
  const appId = APP_IDS[normalized];

  if (!appId) {
    return {
      success: false,
      error: `Unknown app: "${app_name}". Known apps: ${Object.keys(APP_IDS).join(", ")}`,
    };
  }

  return await bridgeFetch("/roku/launch", {
    method: "POST",
    body: JSON.stringify({ app_id: appId, app_name, content_id }),
  });
}

export async function searchContent({ query, type }) {
  return await bridgeFetch("/roku/search", {
    method: "POST",
    body: JSON.stringify({ query, type }),
  });
}

export async function remoteCommand({ command }) {
  const key = KEY_MAP[command];
  if (!key) {
    return { success: false, error: `Unknown command: "${command}". Valid: ${Object.keys(KEY_MAP).join(", ")}` };
  }

  return await bridgeFetch("/roku/keypress", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export async function getStatus() {
  return await bridgeFetch("/roku/status");
}

export async function typeText({ text }) {
  return await bridgeFetch("/roku/type", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
