/**
 * Print the built manual to a single PDF.
 *
 * Astro Starlight is a multi-page static site, so we render the dedicated
 * single-page `/print` route (built to dist/print/index.html) and let headless
 * Chromium print it. A tiny static file server avoids file:// asset-path issues.
 *
 * Reuses the Chromium that ships with @playwright/test — no extra dependency, no
 * Java, no Docker.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(packageRoot, 'dist');
const outPdf = path.join(packageRoot, 'manual.pdf');

if (!fs.existsSync(path.join(dist, 'print', 'index.html'))) {
  console.error(`✗ No built print page at dist/print/. Run \`npm run build\` first.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let fp = path.join(dist, clean);
  try {
    if (fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    return fp;
  } catch {
    if (fs.existsSync(`${fp}.html`)) return `${fp}.html`;
    if (fs.existsSync(path.join(fp, 'index.html'))) return path.join(fp, 'index.html');
    return fp;
  }
}

const server = http.createServer((req, res) => {
  const fp = resolveFile(req.url ?? '/');
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', MIME[path.extname(fp).toLowerCase()] ?? 'application/octet-stream');
    res.end(data);
  });
});

const port = 43_190;
await new Promise((resolve) => server.listen(port, resolve));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/print`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`✓ PDF: ${path.relative(process.cwd(), outPdf)}`);
