// Dev tool: runs the analyzer over the private sampled documents and prints the proposed names.
// Usage: node tools/review-samples.mjs            (no OCR)
//        OCR=1 node tools/review-samples.mjs      (Node-side OCR: pdf.js + @napi-rs/canvas + tesseract.js)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { analyzeDocument } from '../src/analysis/analyze.js';
import { createLocalPdfProvider } from '../src/analysis/pdf-local.js';
import { buildFileName } from '../src/output/naming.js';

const dir = 'fixtures-private/docs';
let ocrEngine = null;
let worker = null;
if (process.env.OCR) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { createWorker } = await import('tesseract.js');
  const langDir = 'fixtures-private/tessdata';
  fs.mkdirSync(langDir, { recursive: true });
  fs.writeFileSync(path.join(langDir, 'heb.traineddata'), zlib.gunzipSync(fs.readFileSync('node_modules/@tesseract.js-data/heb/4.0.0/heb.traineddata.gz')));
  worker = await createWorker('heb', 1, { langPath: langDir, gzip: false, cacheMethod: 'none' });
  ocrEngine = {
    async renderPage(page) {
      const vp = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
      return canvas.toBuffer('image/png');
    },
    async recognize(img) { const { data } = await worker.recognize(img); return { text: data.text, confidence: data.confidence }; },
  };
}
const pdfProvider = createLocalPdfProvider({ wasmUrl: 'node_modules/pdfjs-dist/wasm/', ocrEngine });

const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
for (const it of idx) {
  const [typeText, submitter, date, origin] = it.row;
  const m = date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const row = { typeText, submitter, dateIso: m ? `${m[3]}-${m[2]}-${m[1]}` : '', hebrewDate: '', origin };
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, it.name)));
  const serverName = it.name.replace(/^.*-(\d+\.\w+)$/, '$1');
  const meta = await analyzeDocument({ row, bytes, serverName }, { pdfProvider, ocr: !!ocrEngine });
  console.log(`${meta.category} | ${buildFileName(meta)} | ${meta.confidence} | ${meta.flags.join(',')}`);
}
if (worker) await worker.terminate();
