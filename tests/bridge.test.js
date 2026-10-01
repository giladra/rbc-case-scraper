import { describe, it, expect } from 'vitest';
import { createBridgeProvider } from '../src/ocr/bridge.js';

function fakeTransport({ reply = true, delayMs = 0, order = null } = {}) {
  const handlers = [];
  const sent = [];
  return {
    sent,
    ready: async () => {},
    onMessage: (cb) => handlers.push(cb),
    send(msg) {
      sent.push(msg);
      if (!reply) return;
      const respond = () => handlers.forEach((h) => h(msg.bytes.byteLength === 99
        ? { __rbc: 'pdf-result', id: msg.id, ok: false, error: 'bad pdf' }
        : { __rbc: 'pdf-result', id: msg.id, ok: true, result: { text: 'T' + msg.id, hasTextLayer: true, ocr: null } }));
      if (order) order.push(respond); else setTimeout(respond, delayMs);
    },
  };
}

describe('createBridgeProvider', () => {
  it('returns the reply for the matching id and does not detach the caller bytes', async () => {
    const t = fakeTransport();
    const provider = createBridgeProvider({ transport: t });
    const bytes = new Uint8Array([1, 2, 3]);
    const r = await provider(bytes, { ocr: false });
    expect(r.text).toBe('T1');
    expect(bytes.length).toBe(3);
    expect(t.sent[0]).toMatchObject({ __rbc: 'pdf-text', id: 1, ocr: false });
  });

  it('correlates out-of-order replies', async () => {
    const queue = [];
    const t = fakeTransport({ order: queue });
    const provider = createBridgeProvider({ transport: t });
    const p1 = provider(new Uint8Array([1]));
    const p2 = provider(new Uint8Array([2]));
    await new Promise((r) => setTimeout(r, 0));
    queue.reverse().forEach((fn) => fn());
    expect((await p1).text).toBe('T1');
    expect((await p2).text).toBe('T2');
  });

  it('rejects on an error reply', async () => {
    const provider = createBridgeProvider({ transport: fakeTransport() });
    await expect(provider(new Uint8Array(99))).rejects.toThrow('bad pdf');
  });

  it('rejects on timeout', async () => {
    const provider = createBridgeProvider({ transport: fakeTransport({ reply: false }), timeoutMs: 20 });
    await expect(provider(new Uint8Array([1]))).rejects.toThrow('timeout');
  });
});
