import './raf-polyfill.js';
import { createLocalPdfProvider } from '../analysis/pdf-local.js';
import { createTesseractEngine } from './tesseract-engine.js';

const inExtension = !!globalThis.chrome?.runtime?.id;
const url = (p) => (inExtension ? chrome.runtime.getURL(p) : new URL(p, location.href).href);
// Production: only the court site may talk to this frame. The `parent` override exists for the local harness only.
const SITE_ORIGIN = typeof __PARENT_ORIGIN__ !== 'undefined' ? __PARENT_ORIGIN__ : 'https://sides.rbc.gov.il'; // overridden only by tools/ext-test.mjs
const parentOrigin = inExtension ? SITE_ORIGIN : new URLSearchParams(location.search).get('parent');

const provider = createLocalPdfProvider({
  wasmUrl: url('pdfjs-wasm/'),
  ocrEngine: createTesseractEngine({ workerPath: url('ocr/worker.min.js'), corePath: url('ocr/core'), langPath: url('ocr/lang') }),
});

window.addEventListener('message', async (ev) => {
  if (ev.source !== window.parent || ev.origin !== parentOrigin) return;
  const m = ev.data;
  if (m?.__rbc !== 'pdf-text') return;
  try {
    const result = await provider(new Uint8Array(m.bytes), { ocr: m.ocr });
    window.parent.postMessage({ __rbc: 'pdf-result', id: m.id, ok: true, result }, parentOrigin);
  } catch (e) {
    window.parent.postMessage({ __rbc: 'pdf-result', id: m.id, ok: false, error: String(e?.message ?? e) }, parentOrigin);
  }
});
window.parent.postMessage({ __rbc: 'pdf-ready' }, parentOrigin);
