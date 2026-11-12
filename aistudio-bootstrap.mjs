#!/usr/bin/env node
/**
 * PyMasters — Google AI Studio & Cloud Run Unified Bootstrap
 * Keeps frontend/vite.config.js, Digital Asset Links (/.well-known/assetlinks.json),
 * and Play Store compliance routes (/delete-account) synced, runs Vite in AI Studio Preview,
 * and serves production dist/ + /api reverse-proxy on Cloud Run ($PORT).
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(ROOT, 'frontend');
const mode = process.argv[2] || 'dev';

const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendOrigin = globalThis.process?.env?.PYMASTERS_BACKEND_ORIGIN || 'https://pymasters.net'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number(globalThis.process?.env?.PORT || 3000),
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion': ['framer-motion'],
          'markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
})
`;

const ASSETLINKS = JSON.stringify(
  [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'net.pymasters.app',
        sha256_cert_fingerprints: [
          'F4:32:6C:22:F3:AA:FA:7F:4D:4F:52:CB:03:D7:51:37:A7:9D:BD:3A:FC:55:F7:F6:91:ED:E6:5F:6F:58:EC:60',
        ],
      },
    },
  ],
  null,
  2
);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function syncWorkspaceFiles() {
  if (!fs.existsSync(FRONTEND)) return;
  fs.writeFileSync(path.join(FRONTEND, 'vite.config.js'), VITE_CONFIG, 'utf8');

  const wellKnownDir = path.join(FRONTEND, 'public', '.well-known');
  fs.mkdirSync(wellKnownDir, { recursive: true });
  fs.writeFileSync(path.join(wellKnownDir, 'assetlinks.json'), ASSETLINKS + '\n', 'utf8');

  const appJsxPath = path.join(FRONTEND, 'src', 'App.jsx');
  if (fs.existsSync(appJsxPath)) {
    const src = fs.readFileSync(appJsxPath, 'utf8');
    if (!src.includes('path="/delete-account"')) {
      const updated = src.replace(
        '<Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />',
        '<Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />\n              <Route path="/delete-account" element={<Navigate to="/privacy#account-deletion" replace />} />'
      );
      fs.writeFileSync(appJsxPath, updated, 'utf8');
    }
  }
}

function ensureFrontendDeps() {
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  if (fs.existsSync(viteBin)) return;
  console.log('[PyMasters] Installing frontend dependencies...');
  try {
    execSync('bun install', { cwd: FRONTEND, stdio: 'inherit' });
  } catch {
    execSync('npm install --no-audit --no-fund', { cwd: FRONTEND, stdio: 'inherit' });
  }
}

function buildDist() {
  ensureFrontendDeps();
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  execSync(`"${viteBin}" build`, {
    cwd: FRONTEND,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: process.env.VITE_API_URL || '/api' },
  });
  const rootDist = path.join(ROOT, 'dist');
  fs.rmSync(rootDist, { recursive: true, force: true });
  fs.cpSync(path.join(FRONTEND, 'dist'), rootDist, { recursive: true });
  console.log('[PyMasters] Built frontend/dist and synced to ./dist');
}

function startProductionServer() {
  let distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    distDir = path.join(FRONTEND, 'dist');
  }
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    buildDist();
    distDir = path.join(ROOT, 'dist');
  }

  const port = Number(process.env.PORT || 8080);
  const backendUrl = new URL(process.env.PYMASTERS_BACKEND_ORIGIN || 'https://pymasters.net');

  const server = http.createServer((req, res) => {
    const reqUrl = req.url || '/';

    if (reqUrl === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'pymasters-aistudio' }));
      return;
    }

    if (reqUrl.startsWith('/api/') || reqUrl === '/api') {
      const transport = backendUrl.protocol === 'https:' ? https : http;
      const proxyReq = transport.request(
        {
          protocol: backendUrl.protocol,
          hostname: backendUrl.hostname,
          port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
          method: req.method,
          path: reqUrl,
          headers: {
            ...req.headers,
            host: backendUrl.host,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: `Upstream proxy error: ${err.message}` }));
      });
      req.pipe(proxyReq);
      return;
    }

    const cleanPath = decodeURIComponent(reqUrl.split('?')[0]);
    const candidate = path.normalize(path.join(distDir, cleanPath));
    if (candidate.startsWith(distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(candidate).pipe(res);
      return;
    }

    // SPA fallback
    const indexHtml = path.join(distDir, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    fs.createReadStream(indexHtml).pipe(res);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[PyMasters] Production server listening on http://0.0.0.0:${port}`);
  });
}

syncWorkspaceFiles();

if (mode === 'sync') {
  ensureFrontendDeps();
  process.exit(0);
}

if (mode === 'build') {
  buildDist();
  process.exit(0);
}

if (mode === 'start' || mode === 'preview') {
  startProductionServer();
} else {
  ensureFrontendDeps();
  const viteBin = path.join(FRONTEND, 'node_modules', '.bin', 'vite');
  const port = process.env.PORT || '3000';
  const child = spawn(viteBin, ['--host', '0.0.0.0', '--port', String(port)], {
    cwd: FRONTEND,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL || '/api',
      PYMASTERS_BACKEND_ORIGIN: process.env.PYMASTERS_BACKEND_ORIGIN || 'https://pymasters.net',
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
