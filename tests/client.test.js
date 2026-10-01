import { describe, it, expect } from 'vitest';
import { parse, listPage, docsPage, listRows, groupRowHtml, mainOf, dxCallbackText, COMBO, COMBO_VI, FIND_BTN } from './helpers/html.js';
import { createClient, SessionExpiredError, CaseMismatchError, DownloadError } from '../src/site/client.js';

const BASE = 'https://sides.rbc.gov.il/Pages/';
const SUBS = [
  { name: '1111111/4, חלוקת רכוש, א, ב', t3: 'T4', t4: '4' },
  { name: '2222222/1, צווים אחרים, א, ב', t3: 'T1', t4: '1', closed: '24/11/2020' },
];
const DOCS = { T4: [{ type: 'החלטה - ריבוי החלטות', tok: 'D1', hash: '10' }], T1: [{ type: 'בקשה - בקשה כלשהי', tok: 'D2', hash: '20' }, { type: 'בקשה', tok: 'D3', hash: '30' }] };
const NAMES = { T4: '1111111/4', T1: '2222222/1' };

function resp(url, body, { status = 200, headers = {} } = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    ok: status < 400, status, url,
    text: async () => (typeof body === 'string' ? body : ''),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  };
}

function fakeSite({ expired = false, emptyDownload = false, wrongCase = false, preExpanded = false } = {}) {
  const calls = [];
  let current = null;
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.split('/').pop();
    const body = init.body instanceof URLSearchParams ? init.body : null;
    calls.push({ path, method: init.method ?? 'GET', body });
    if (expired) return resp(BASE + 'Login.aspx', '<html><body>login</body></html>');
    if (path === 'FilesList.aspx' && !body) return resp(url, listPage({ subs: SUBS.slice(0, 1), collapsed: true }));
    if (path === 'FilesList.aspx' && body.has(FIND_BTN)) {
      const all = body.get(COMBO_VI) === '0' && body.get(COMBO) === 'הכל';
      return resp(url, listPage({ subs: all ? SUBS : SUBS.slice(0, 1), filterText: all ? 'הכל' : 'פתוחים', filterValue: all ? '0' : '1', collapsed: !preExpanded }));
    }
    if (path === 'FilesList.aspx' && body.has('__CALLBACKID')) {
      // DevExpress "expand group" callback: reply with that group's rows only.
      const idx = Number(body.get('__CALLBACKPARAM').match(/EXPANDROW\d\|(\d+)5\|false/)[1]);
      const mains = [...new Set(SUBS.map(mainOf))].sort();
      const main = mains[idx];
      return resp(url, dxCallbackText(groupRowHtml(main, idx, true) + listRows(SUBS.filter((s) => mainOf(s) === main), idx + 1)));
    }
    if (path === 'FilesList.aspx' && body.get('FileID')) { current = body.get('FileID'); return resp(BASE + 'FileDetails.aspx', '<html><body><form name="aspnetForm"></form></body></html>'); }
    if (path === 'FileDocuments.aspx') {
      const key = wrongCase ? 'T4' : current;
      return resp(url, docsPage({ header: `מסמכים עבור תיק - ${NAMES[key]}, שם`, rows: DOCS[key] }));
    }
    if (path === 'DocViewer.ashx') {
      if (emptyDownload) return resp(url, new Uint8Array(0));
      return resp(url, new TextEncoder().encode('FILE:' + body.get('DocumentNumber')), { headers: { 'content-disposition': `attachment; filename=${body.get('DocumentNumberhash')}1.PDF` } });
    }
    return resp(url, 'nope', { status: 404 });
  };
  return { fetchFn, calls };
}

const mk = (opts) => { const s = fakeSite(opts); return { ...s, client: createClient({ fetchFn: s.fetchFn, parseHtml: parse, base: BASE }) }; };

describe('client', () => {
  it('loadAllCases applies the "all" filter and returns closed cases too', async () => {
    const { client, calls } = mk();
    const mains = await client.loadAllCases();
    expect(mains.flatMap((m) => m.subCases.map((s) => s.fullNo))).toEqual(['1111111/4', '2222222/1']);
    const post = calls.find((c) => c.method === 'POST');
    expect(post.body.get(COMBO_VI)).toBe('0');
    expect(post.body.has(FIND_BTN)).toBe(true);
  });

  it('expands every collapsed group with a grid callback (the server returns group rows only)', async () => {
    const { client, calls } = mk();
    const mains = await client.loadAllCases();
    const callbacks = calls.filter((c) => c.body?.has('__CALLBACKID'));
    expect(callbacks.map((c) => c.body.get('__CALLBACKPARAM'))).toEqual(['c0:GB|21;9|EXPANDROW1|05|false;', 'c0:GB|21;9|EXPANDROW1|15|false;']);
    expect(callbacks[0].body.get('__CALLBACKID')).toBe('ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel2$grdFilesView');
    expect(callbacks[0].body.get('__VIEWSTATE')).toBe('VS');
    expect(mains.map((m) => [m.mainNo, m.subCases.length])).toEqual([['1111111', 1], ['2222222', 1]]);
    expect(mains[1].subCases[0]).toMatchObject({ fullNo: '2222222/1', isClosed: true, fileToken: 'T1' });
  });

  it('does not issue callbacks when the rows are already present', async () => {
    const { client, calls } = mk({ preExpanded: true });
    const mains = await client.loadAllCases();
    expect(calls.some((c) => c.body?.has('__CALLBACKID'))).toBe(false);
    expect(mains.flatMap((m) => m.subCases.map((s) => s.fullNo))).toEqual(['1111111/4', '2222222/1']);
  });

  it('openSubCase posts FileID/hash, getDocuments verifies the case', async () => {
    const { client, calls } = mk();
    const mains = await client.loadAllCases();
    const closed = mains[1].subCases[0];
    await client.openSubCase(closed);
    const open = calls.filter((c) => c.method === 'POST').pop();
    expect(open.body.get('FileID')).toBe('T1');
    expect(open.body.get('hash')).toBe('1');
    expect(open.body.get('__VIEWSTATE')).toBe('VS');
    const page = await client.getDocuments(closed);
    expect(page.rows.map((r) => r.docToken)).toEqual(['D2', 'D3']);
    expect(page.form.get('__VIEWSTATE')).toBe('VS2');
  });

  it('detects the wrong case in session', async () => {
    const { client } = mk({ wrongCase: true });
    const mains = await client.loadAllCases();
    await client.openSubCase(mains[1].subCases[0]);
    await expect(client.getDocuments(mains[1].subCases[0])).rejects.toBeInstanceOf(CaseMismatchError);
  });

  it('downloadDocument posts DocumentNumber/hash and returns bytes + server name', async () => {
    const { client, calls } = mk();
    const mains = await client.loadAllCases();
    await client.openSubCase(mains[0].subCases[0]);
    const page = await client.getDocuments(mains[0].subCases[0]);
    const f = await client.downloadDocument(page, page.rows[0]);
    expect(new TextDecoder().decode(f.bytes)).toBe('FILE:D1');
    expect(f.serverName).toBe('101.PDF');
    const dl = calls.filter((c) => c.path === 'DocViewer.ashx').pop();
    expect(dl.body.get('DocumentNumber')).toBe('D1');
    expect(dl.body.get('DocumentNumberhash')).toBe('10');
  });

  it('empty download -> DownloadError', async () => {
    const { client } = mk({ emptyDownload: true });
    const mains = await client.loadAllCases();
    await client.openSubCase(mains[0].subCases[0]);
    const page = await client.getDocuments(mains[0].subCases[0]);
    await expect(client.downloadDocument(page, page.rows[0])).rejects.toBeInstanceOf(DownloadError);
  });

  it('expired session -> fatal SessionExpiredError', async () => {
    const { client } = mk({ expired: true });
    const err = await client.loadAllCases().catch((e) => e);
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(err.fatal).toBe(true);
  });

  it('redirect to another origin (login.gov.il) -> SessionExpiredError', async () => {
    const fetchFn = async () => resp('https://login.gov.il/nidp/GOV/FilesList.aspx', '<html><body>שגיאה</body></html>', { status: 404 });
    const client = createClient({ fetchFn, parseHtml: parse, base: BASE });
    await expect(client.loadAllCases()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('cross-origin redirect failure (fetch TypeError) -> SessionExpiredError', async () => {
    const fetchFn = async () => { throw new TypeError('Failed to fetch'); };
    const client = createClient({ fetchFn, parseHtml: parse, base: BASE });
    const err = await client.loadAllCases().catch((e) => e);
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(err.fatal).toBe(true);
  });

  it('openSubCase before loadAllCases throws', async () => {
    const { client } = mk();
    await expect(client.openSubCase({ fileToken: 'x', fileHash: '1' })).rejects.toThrow();
  });
});
