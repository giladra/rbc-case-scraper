// Extension-context smoke test.
// Loads the built extension into Playwright's bundled Chromium (branded Chrome ignores --load-extension) and runs the REAL
// content-script bridge -> extension-page PDF host -> pdf.js / Tesseract (WASM) path against synthetic PDFs on a local page.
// It catches problems that only exist inside a real extension (extension CSP for WebAssembly, hidden cross-origin frames).
//
// Prereqs:  npm run build   and   node tools/serve-dist.mjs   (port 8123, in another terminal)
// Chromium: auto-detected from the Playwright cache, or set CHROMIUM=/path/to/chrome.
// Optional: FX_SCAN=<file in fixtures-private/docs>  also OCRs a real scanned PDF of your own.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { makePdf } from '../tests/helpers/make-files.js';

const ORIGIN = 'http://localhost:8123';
const out = 'dist-ext-test';

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'), path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    const d = fs.readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    if (!d) continue;
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('Chromium not found. Run `npx playwright-core install chromium` or set CHROMIUM=/path/to/chrome');
}

if (!fs.existsSync('dist/pdf-host.html')) throw new Error('Run `npm run build` first.');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync('dist', out, { recursive: true });
const common = { bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', logLevel: 'error' };
await build({ ...common, entryPoints: ['src/ocr/pdf-host.js'], outfile: `${out}/pdf-host.js`, define: { __PARENT_ORIGIN__: JSON.stringify(ORIGIN) } });
await build({ ...common, entryPoints: ['tools/ext-test-content.js'], outfile: `${out}/ext-test-content.js` });
// Same manifest as production (including the extension CSP), pointed at the local test page instead of the court site.
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.content_scripts = [{ matches: [`${ORIGIN}/ext-test.html`], js: ['ext-test-content.js'], run_at: 'document_idle' }];
manifest.web_accessible_resources = [{ resources: ['pdf-host.html', 'pdf-host.js', 'ocr/*', 'pdfjs-wasm/*'], matches: [`${ORIGIN}/*`] }];
fs.writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
fs.writeFileSync('dist/ext-test.html', '<!doctype html><meta charset="utf-8"><title>ext test</title>');

// Synthetic fixtures (served by tools/serve-dist.mjs from fixtures-private/docs, which is git-ignored).
fs.mkdirSync('fixtures-private/docs', { recursive: true });
fs.writeFileSync('fixtures-private/docs/synthetic-text.pdf', makePdf('Hello world this is a petition about nothing important at all'));
fs.writeFileSync('fixtures-private/docs/synthetic-blank.pdf', makePdf(''));

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rbc-ext-'));
const ctx = await chromium.launchPersistentContext(userData, {
  executablePath: findChromium(), headless: false,
  args: [`--disable-extensions-except=${path.resolve(out)}`, `--load-extension=${path.resolve(out)}`, '--headless=new'],
});
let failed = false;
try {
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) logs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${ORIGIN}/ext-test.html`);
  await page.evaluate(() => new Promise((res) => { addEventListener('message', (e) => e.data?.__test === 'ready' && res()); setTimeout(res, 3000); }));
  const run = (name, ocr = true) => page.evaluate(({ name, ocr, id }) => new Promise((res) => {
    const h = (e) => { if (e.data?.__test === 'result' && e.data.id === id) { removeEventListener('message', h); res(e.data); } };
    addEventListener('message', h);
    postMessage({ __test: 'run', name, ocr, id }, '*');
    setTimeout(() => res({ timeout: true }), 60000);
  }), { name, ocr, id: Math.random() });

  const checks = [
    ['text-layer PDF is read without OCR', await run('synthetic-text.pdf'), (r) => r.ok && r.hasTextLayer && r.ocr === null && /Hello world/.test(r.text)],
    ['blank PDF runs OCR (WebAssembly + worker work under the extension CSP)', await run('synthetic-blank.pdf'), (r) => r.ok && r.ocr?.used === true],
    ['OCR switched off is honoured', await run('synthetic-blank.pdf', false), (r) => r.ok && r.ocr === null],
  ];
  if (process.env.FX_SCAN) checks.push(['your own scanned PDF is OCR-read', await run(process.env.FX_SCAN), (r) => r.ok && r.ocr?.used === true && r.ocr.confidence > 0]);
  for (const [name, result, ok] of checks) {
    const pass = !result.timeout && ok(result);
    if (!pass) failed = true;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${result.ms != null ? `  (${result.ms} ms)` : ''}${pass ? '' : '  -> ' + JSON.stringify(result)}`);
  }
  if (logs.length) { console.log('console errors:', logs); failed = true; }
} finally {
  await ctx.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
