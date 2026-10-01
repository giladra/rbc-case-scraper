import { createClient } from '../site/client.js';
import { analyzeDocument } from '../analysis/analyze.js';
import { createBridgeProvider, createIframeTransport } from '../ocr/bridge.js';
import { mountPanel } from './panel.js';

function saveZip(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

if (!window.__rbcScraperMounted) {
  window.__rbcScraperMounted = true;
  const client = createClient({
    fetchFn: (...a) => fetch(...a),
    parseHtml: (t) => new DOMParser().parseFromString(t, 'text/html'),
    base: location.origin + '/Pages/',
  });
  const pdfProvider = createBridgeProvider({ transport: createIframeTransport({ src: chrome.runtime.getURL('pdf-host.html') }) });
  const analyze = ({ row, bytes, serverName, ocr }) => analyzeDocument({ row, bytes, serverName }, { pdfProvider, ocr });
  mountPanel({ client, analyze, saveZip });
}
