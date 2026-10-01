// Test-only content script (loaded by tools/ext-test.mjs on a localhost page): exercises the REAL bridge + extension-page host.
import { createBridgeProvider, createIframeTransport } from '../src/ocr/bridge.js';

const pdfProvider = createBridgeProvider({ transport: createIframeTransport({ src: chrome.runtime.getURL('pdf-host.html') }) });
window.addEventListener('message', async (ev) => {
  if (ev.source !== window || ev.data?.__test !== 'run') return;
  try {
    const bytes = new Uint8Array(await (await fetch('/fx/' + ev.data.name)).arrayBuffer());
    const t = performance.now();
    const r = await pdfProvider(bytes, { ocr: ev.data.ocr });
    window.postMessage({ __test: 'result', id: ev.data.id, ok: true, ms: Math.round(performance.now() - t), hasTextLayer: r.hasTextLayer, ocr: r.ocr, text: r.text.split('\n').filter(Boolean).slice(0, 4).join(' | ') }, '*');
  } catch (e) {
    window.postMessage({ __test: 'result', id: ev.data.id, ok: false, error: String(e.message || e) }, '*');
  }
});
window.postMessage({ __test: 'ready' }, '*');
