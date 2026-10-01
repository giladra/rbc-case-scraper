import { createBridgeProvider, createIframeTransport } from '../src/ocr/bridge.js';

window.rbcHarness = {
  async run(name, ocr = true) {
    const bytes = new Uint8Array(await (await fetch('/fx/' + name)).arrayBuffer());
    window.__provider ??= createBridgeProvider({
      transport: createIframeTransport({ src: '/pdf-host.html?parent=' + encodeURIComponent(location.origin) }),
    });
    const t = performance.now();
    const r = await window.__provider(bytes, { ocr });
    return { ...r, ms: Math.round(performance.now() - t) };
  },
};
