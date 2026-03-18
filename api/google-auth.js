// ─── GOOGLE OAUTH SETUP ───
// One-time flow to get a refresh token for Google Calendar + Sheets access.
// 1. Visit /api/google-auth to start the OAuth flow
// 2. Authorize in Google
// 3. Copy the refresh token to Vercel env vars as GOOGLE_REFRESH_TOKEN
// 4. You're done — Tony has calendar + sheets access forever.

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables.",
      setup: {
        step1: "Go to https://console.cloud.google.com/apis/credentials",
        step2: "Create an OAuth 2.0 Client ID (Web application)",
        step3: "Add redirect URI: https://your-domain.vercel.app/api/google-auth",
        step4: "Enable Google Calendar API and Google Sheets API",
        step5: "Copy Client ID and Client Secret to Vercel env vars",
      },
    });
  }

  // If we have a code parameter, exchange it for tokens
  const code = req.query?.code;
  if (code) {
    try {
      const host = req.headers.host;
      const protocol = host.includes("localhost") ? "http" : "https";
      const redirectUri = `${protocol}://${host}/api/google-auth`;

      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await resp.json();
      if (tokens.error) {
        return res.status(400).json({ error: tokens.error_description || tokens.error });
      }

      // Show the refresh token to copy
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Tony — Google Auth Complete</title>
        <style>
          body { background: #0F1923; color: #E8EEF4; font-family: 'Segoe UI', sans-serif; padding: 40px; text-align: center; }
          .token-box { background: #1A2633; border: 1px solid rgba(74,111,165,0.3); border-radius: 12px; padding: 24px; margin: 24px auto; max-width: 600px; word-break: break-all; }
          .token { font-family: monospace; font-size: 13px; color: #3ECF8E; background: rgba(62,207,142,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; }
          h1 { color: #4A6FA5; }
          .step { color: #F5A623; font-size: 14px; margin: 8px 0; }
        </style>
        </head>
        <body>
          <h1>Tony is connected to Google.</h1>
          <div class="token-box">
            <p>Copy this <strong>Refresh Token</strong> and add it to your Vercel environment variables:</p>
            <div class="token">${tokens.refresh_token || "No refresh token received — you may need to revoke access and try again."}</div>
            <div class="step">Vercel Dashboard → Settings → Environment Variables</div>
            <div class="step">Variable name: <strong>GOOGLE_REFRESH_TOKEN</strong></div>
            <div class="step">Then redeploy Tony.</div>
          </div>
          ${tokens.access_token ? '<p style="color:#3ECF8E">✓ Access token received — Google Calendar & Sheets are ready.</p>' : ""}
        </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // No code — redirect to Google OAuth consent screen
  const host = req.headers.host;
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/google-auth`;

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
  ];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return res.redirect(302, authUrl.toString());
}
