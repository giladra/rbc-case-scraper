import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const common = { bundle: true, format: 'iife', platform: 'browser', target: 'chrome110', legalComments: 'none', logLevel: 'info' };

// The content entry is added in Task 12; the host bundle and assets exist from Task 11 on.
if (fs.existsSync('src/content/index.js')) await build({ ...common, entryPoints: ['src/content/index.js'], outfile: `${out}/content.js` });
if (fs.existsSync('src/ocr/pdf-host.js')) {
  await build({ ...common, entryPoints: ['src/ocr/pdf-host.js'], outfile: `${out}/pdf-host.js` });
  fs.writeFileSync(`${out}/pdf-host.html`, '<!doctype html><meta charset="utf-8"><title>pdf host</title><script src="pdf-host.js"></script>');
  const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
  copy('node_modules/tesseract.js/dist/worker.min.js', `${out}/ocr/worker.min.js`);
  for (const f of fs.readdirSync('node_modules/tesseract.js-core')) {
    if (/-lstm\.wasm\.js$/.test(f)) copy(`node_modules/tesseract.js-core/${f}`, `${out}/ocr/core/${f}`);
  }
  fs.mkdirSync(`${out}/ocr/lang`, { recursive: true });
  fs.writeFileSync(`${out}/ocr/lang/heb.traineddata`, zlib.gunzipSync(fs.readFileSync('node_modules/@tesseract.js-data/heb/4.0.0/heb.traineddata.gz')));
  for (const f of ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm']) copy(`node_modules/pdfjs-dist/wasm/${f}`, `${out}/pdfjs-wasm/${f}`);
}
fs.copyFileSync('manifest.json', `${out}/manifest.json`);
