/**
 * @file server.js
 * @brief Zero-dependency HTTP static server for the Braun Ambient Synthesizer.
 * Supports standard MIME types, module scripts, HEAD requests, traversal containment, and local development.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

export function createStaticServer(rootDir = __dirname) {
  const resolvedRoot = path.resolve(rootDir);

  return http.createServer((req, res) => {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Allow': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
      });
      res.end();
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Allow': 'GET, HEAD, OPTIONS'
      });
      res.end('405 Method Not Allowed');
      return;
    }

    const rawUrl = typeof req.url === 'string' ? req.url : '/';
    const rawPath = rawUrl.split('?')[0].split('#')[0];

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }

    if (decodedPath.includes('\0')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }

    const normalizedUrlPath = decodedPath.replace(/\\/g, '/');
    const reqPath = (normalizedUrlPath === '/' || normalizedUrlPath === '') ? '/index.html' : normalizedUrlPath;

    // Strictly resolve against root and verify containment (prevents /%2e%2e/ traversal)
    const candidatePath = path.resolve(resolvedRoot, '.' + (reqPath.startsWith('/') ? reqPath : '/' + reqPath));
    const relFromRoot = path.relative(resolvedRoot, candidatePath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    // Block hidden dot-directories / dotfiles (e.g. /.git/config)
    const segments = relFromRoot.split(path.sep);
    if (segments.some(seg => seg.startsWith('.') && seg !== '.')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(candidatePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(method === 'HEAD' ? undefined : '404 Not Found');
        return;
      }

      const ext = path.extname(candidatePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
      });

      if (method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(candidatePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    });
  });
}

export const server = createStaticServer(__dirname);

const isDirectRun = Boolean(
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
);

if (isDirectRun) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  BRAUN AMBIENT SYNTHESIZER · LOCAL SERVER`);
    console.log(`  Running at: http://localhost:${PORT}`);
    console.log(`  Press Ctrl+C to terminate.`);
    console.log(`======================================================\n`);
  });
}
