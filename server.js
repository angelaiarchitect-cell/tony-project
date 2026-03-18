// server.js — Lightweight Express proxy for Anthropic API
// Keeps your API key server-side so it's never exposed in the browser.
//
// USAGE:
//   1. Set ANTHROPIC_API_KEY in your .env file
//   2. Run: node server.js
//   3. Tony's frontend calls /api/chat instead of api.anthropic.com directly
//
// For Vercel deployment, use the /api/chat.js serverless function instead.

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// API proxy endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(500).json({ error: { message: 'API proxy error: ' + error.message } });
  }
});

// SPA fallback — serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tony server running on http://localhost:${PORT}`);
  console.log('API key loaded:', process.env.ANTHROPIC_API_KEY ? 'Yes' : 'MISSING — set ANTHROPIC_API_KEY in .env');
});
