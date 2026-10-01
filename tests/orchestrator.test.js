import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { runScrape } from '../src/run/orchestrator.js';
import { SessionExpiredError } from '../src/site/client.js';

const sub = (main, n, subject = 'נושא') => ({ mainNo: main, subNo: String(n), fullNo: `${main}/${n}`, subject, fileToken: `t${n}`, fileHash: '1' });
const sleep = async () => {};

function fakeClient({ docsBySub, failDoc = null, expireOn = null }) {
  const log = [];
  let current = null;
  return {
    log,
    async openSubCase(s) { log.push('open ' + s.fullNo); current = s.fullNo; },
    async getDocuments(s) { return { rows: docsBySub[s.fullNo], total: docsBySub[s.fullNo].length, header: s.fullNo, form: new URLSearchParams() }; },
    async downloadDocument(page, row) {
      if (expireOn === row.docToken) throw new SessionExpiredError();
      if (failDoc === row.docToken) throw new Error('boom');
      log.push('dl ' + current + ' ' + row.docToken);
      return { bytes: new TextEncoder().encode('B' + row.docToken), serverName: `${row.docToken}.PDF` };
    },
  };
}
const row = (tok, type = 'בקשה - בקשה כלשהי') => ({ index: 0, typeText: type, submitter: '', dateIso: '2026-01-01', hebrewDate: '', origin: 'חיצוני', docToken: tok, docHash: '1' });
const analyze = async ({ row, serverName }) => ({
  category: 'בקשות וכתבי טענות', kind: 'בקשה', headline: row.typeText, recipient: '', hearingDateIso: '', filer: 'x', filerRole: '', dateIso: row.dateIso,
  bodyDateIso: '', hebrewDate: '', origin: row.origin, typeText: row.typeText, confidence: 'medium', flags: [], hasTextLayer: true, ext: 'pdf', serverName, docId: row.docToken.replace(/\D/g, ''),
});

describe('runScrape', () => {
  it('processes sub-cases sequentially and emits one zip per main case', async () => {
    const client = fakeClient({ docsBySub: { '1/1': [row('d1'), row('d2')], '1/2': [row('d3')], '2/1': [row('d4')] } });
    const events = [];
    const res = await runScrape({ client, subs: [sub('1', 1), sub('1', 2), sub('2', 1)], analyze, emit: (e) => events.push(e), concurrency: 2, pauseMs: 0, sleep });
    expect(client.log.filter((l) => l.startsWith('open'))).toEqual(['open 1/1', 'open 1/2', 'open 2/1']);
    const zips = events.filter((e) => e.type === 'zip');
    expect(zips.map((z) => [z.mainNo, z.fileName, z.docCount])).toEqual([['1', '1.zip', 3], ['2', '2.zip', 1]]);
    const files = unzipSync(zips[0].bytes);
    expect(Object.keys(files).filter((k) => k.endsWith('.pdf')).length).toBe(3);
    expect(files['1/index.csv']).toBeTruthy();
    expect(JSON.parse(strFromU8(files['1/index.json']))).toHaveLength(3);
    expect(res.docs).toBe(4);
    expect(events.at(-1).type).toBe('done');
  });

  it('a failing document is recorded and does not stop the run', async () => {
    const client = fakeClient({ docsBySub: { '1/1': [row('d1'), row('d2')] }, failDoc: 'd1' });
    const events = [];
    const res = await runScrape({ client, subs: [sub('1', 1)], analyze, emit: (e) => events.push(e), pauseMs: 0, retries: 0, sleep });
    expect(res.errors).toHaveLength(1);
    const files = unzipSync(events.find((e) => e.type === 'zip').bytes);
    const idx = JSON.parse(strFromU8(files['1/index.json']));
    expect(idx).toHaveLength(2);
    expect(idx.find((r) => r.flags.startsWith('download-failed'))).toBeTruthy();
    expect(res.docs).toBe(1);
  });

  it('colliding names get unique paths', async () => {
    const client = fakeClient({ docsBySub: { '1/1': [row('d1'), row('d2')] } });
    const events = [];
    await runScrape({ client, subs: [sub('1', 1)], analyze: async (a) => ({ ...(await analyze(a)), docId: a.row.docToken.slice(1) }), emit: (e) => events.push(e), pauseMs: 0, sleep });
    const names = Object.keys(unzipSync(events.find((e) => e.type === 'zip').bytes)).filter((k) => k.endsWith('.pdf'));
    expect(new Set(names).size).toBe(2);
  });

  it('abort emits a partial zip and stops', async () => {
    const ac = new AbortController();
    const client = fakeClient({ docsBySub: { '1/1': [row('d1')], '1/2': [row('d2')] } });
    const events = [];
    await runScrape({ client, subs: [sub('1', 1), sub('1', 2)], analyze, emit: (e) => { events.push(e); if (e.type === 'doc') ac.abort(); }, signal: ac.signal, pauseMs: 0, sleep });
    expect(client.log).not.toContain('open 1/2');
    expect(events.find((e) => e.type === 'zip').docCount).toBe(1);
  });

  it('fatal error: emits what it has, then rethrows', async () => {
    const client = fakeClient({ docsBySub: { '1/1': [row('d1')], '2/1': [row('d2')] }, expireOn: 'd2' });
    const events = [];
    await expect(runScrape({ client, subs: [sub('1', 1), sub('2', 1)], analyze, emit: (e) => events.push(e), pauseMs: 0, sleep })).rejects.toBeInstanceOf(SessionExpiredError);
    expect(events.filter((e) => e.type === 'zip').map((z) => z.mainNo)).toEqual(['1', '2']);
  });
});
