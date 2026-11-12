import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
};

const SYSTEM_INSTRUCTION = `You are Vaathiyaar, the friendly AI Python teacher at PyMasters (https://pymasters.net).
Rules:
- Teach clearly in plain, concise English suitable for reading on a mobile phone screen.
- Warm Tamil greetings like "Vanakkam" or "Nanba" are welcome occasionally, but NEVER use any Hindi words.
- Include short, runnable Python 3 examples (under 15 lines) and explain *why* the code works.`;

let aiClient = null;
function getGenAI() {
  if (aiClient) return aiClient;
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
  } else {
    aiClient = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'pymasters-app',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return aiClient;
}

function readJsonBody(req, maxBytes = 32768) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    const apkPath = path.join(DIST_DIR, 'download', 'PyMasters.apk');
    const apkStat = fs.existsSync(apkPath) ? fs.statSync(apkPath) : null;
    return sendJson(res, 200, {
      status: 'ok',
      service: 'pymasters-mobile-companion',
      apkAvailable: Boolean(apkStat),
      apkSizeBytes: apkStat ? apkStat.size : 0,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/tutor') {
    try {
      const body = await readJsonBody(req);
      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) {
        return sendJson(res, 400, { error: 'Please enter a Python question.' });
      }
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        contents: message,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.4,
          maxOutputTokens: 700,
        },
      });
      const reply = response?.text || 'Let us trace that Python snippet step by step — try running it in the Code Lab tab!';
      return sendJson(res, 200, { reply });
    } catch (err) {
      console.error('Tutor API error:', err?.message || err);
      return sendJson(res, 200, {
        reply:
          'Vanakkam! Live AI generation is momentarily busy, so here is a quick tip: test your snippet in the **Code Lab** tab right here on your phone, or open the full Vaathiyaar studio at [pymasters.net](https://pymasters.net/dashboard/vaathiyaar).',
        fallback: true,
      });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }

  const safeRel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(DIST_DIR, safeRel);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // SPA client route fallback
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  };

  if (ext === '.apk') {
    headers['Content-Disposition'] = 'attachment; filename="PyMasters-v1.0.0.apk"';
    headers['Cache-Control'] = 'public, max-age=300';
  } else if (url.pathname.startsWith('/assets/')) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'no-cache';
  }

  const stat = fs.statSync(filePath);
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PyMasters Mobile Companion listening on http://0.0.0.0:${PORT}`);
});
