export function createBridgeProvider({ transport, timeoutMs = 120000 }) {
  let seq = 0;
  let wired = false;
  const pending = new Map();

  const wire = () => {
    if (wired) return;
    wired = true;
    transport.onMessage((m) => {
      if (m?.__rbc !== 'pdf-result') return;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
    });
  };

  return async function pdfProvider(bytes, { ocr = true } = {}) {
    wire();
    await transport.ready();
    const id = ++seq;
    const buf = bytes.slice().buffer;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('pdf host timeout')); }, timeoutMs);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      transport.send({ __rbc: 'pdf-text', id, bytes: buf, ocr }, [buf]);
    });
  };
}

export function createIframeTransport({ src, doc = document, win = window, readyTimeoutMs = 30000 }) {
  const absSrc = new URL(src, win.location?.href ?? 'http://localhost/').href;
  const origin = new URL(absSrc).origin;
  const listeners = [];
  let frame = null;
  let readyP = null;
  win.addEventListener('message', (ev) => {
    if (!frame || ev.source !== frame.contentWindow) return;
    for (const l of listeners) l(ev.data);
  });
  return {
    ready() {
      readyP ??= new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('מנוע ה-PDF/OCR לא נטען')), readyTimeoutMs);
        listeners.push((m) => { if (m?.__rbc === 'pdf-ready') { clearTimeout(t); resolve(); } });
        frame = doc.createElement('iframe');
        frame.src = absSrc;
        frame.style.cssText = 'display:none';
        doc.body.appendChild(frame);
      });
      return readyP;
    },
    send(msg, transfer) { frame.contentWindow.postMessage(msg, origin, transfer); },
    onMessage(cb) { listeners.push(cb); },
  };
}
