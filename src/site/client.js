import { serializeForm, findForm } from './form.js';
import { parseCaseList } from './parse-list.js';
import { parseDocumentsPage } from './parse-docs.js';
import { expandRowParam, parseCallbackHtml } from './dx-callback.js';

const COMBO = 'ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel1$cmbFileState';
const COMBO_VI = 'ctl00_ctl00_ContentPlaceHolder_PH_GridData_ASPxRoundPanel1_cmbFileState_VI';
const GRID_ID = 'ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel2$grdFilesView';
const FIND_BTN = 'ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel1$btnFindUserFiles';

export class SessionExpiredError extends Error {
  constructor(msg = 'פג תוקף ההתחברות — התחבר מחדש לאתר והפעל שוב') { super(msg); this.name = 'SessionExpiredError'; this.fatal = true; }
}
export class CaseMismatchError extends Error { constructor(msg) { super(msg); this.name = 'CaseMismatchError'; } }
export class DownloadError extends Error { constructor(msg) { super(msg); this.name = 'DownloadError'; } }

export function createClient({ fetchFn, parseHtml, base }) {
  let listTemplate = null;
  const abs = (p) => new URL(p, base).toString();

  const baseOrigin = new URL(base).origin;
  async function send(path, init) {
    let res;
    try {
      res = await fetchFn(abs(path), { credentials: 'include', ...init });
    } catch (e) {
      // A lapsed session redirects to login.gov.il; the cross-origin redirect surfaces as a TypeError.
      if (e instanceof TypeError) throw new SessionExpiredError('הבקשה לאתר נכשלה — ייתכן שפג תוקף ההתחברות. התחבר מחדש והפעל שוב');
      throw e;
    }
    if (res.url && new URL(res.url).origin !== baseOrigin) throw new SessionExpiredError();
    return res;
  }
  async function pageText(path, init) {
    const res = await send(path, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} (${path})`);
    return { res, text: await res.text() };
  }
  function docOf(text) {
    const doc = parseHtml(text);
    const form = findForm(doc);
    if (!form) throw new SessionExpiredError();
    return { doc, form };
  }

  // The server returns only collapsed group rows; each group's sub-cases come from a DevExpress expand callback.
  async function expandGroups(doc) {
    const byMain = new Map();
    const absorb = (d) => {
      for (const m of parseCaseList(d)) {
        const have = byMain.get(m.mainNo);
        if (!have) { byMain.set(m.mainNo, m); continue; }
        for (const s of m.subCases) if (!have.subCases.some((x) => x.fullNo === s.fullNo)) have.subCases.push(s);
      }
    };
    absorb(doc);
    const collapsed = [...doc.querySelectorAll('tr[id*="grdFilesView_DXGroupRow"]')].filter((r) => !/DXGroupRowExp/.test(r.id));
    for (const row of collapsed) {
      const idx = row.id.match(/DXGroupRow(\d+)$/)?.[1];
      if (idx === undefined) continue;
      const body = new URLSearchParams(listTemplate);
      body.set('__CALLBACKID', GRID_ID);
      body.set('__CALLBACKPARAM', expandRowParam(idx));
      const { text } = await pageText('FilesList.aspx', { method: 'POST', body });
      absorb(parseHtml(`<html><body>${parseCallbackHtml(text)}</body></html>`));
    }
    const mains = [...byMain.values()].sort((a, b) => a.mainNo.localeCompare(b.mainNo, 'en', { numeric: true }));
    for (const m of mains) m.subCases.sort((a, b) => Number(a.subNo) - Number(b.subNo));
    return mains;
  }

  return {
    async loadAllCases() {
      const first = docOf((await pageText('FilesList.aspx')).text);
      const body = serializeForm(first.form);
      body.set(COMBO_VI, '0');
      body.set(COMBO, 'הכל');
      body.set(`${COMBO}$DDD$L`, '0');
      body.set(FIND_BTN, '');
      const second = docOf((await pageText('FilesList.aspx', { method: 'POST', body })).text);
      const shown = second.doc.querySelector(`input[name="${COMBO}"]`)?.getAttribute('value');
      if (shown !== 'הכל') throw new Error('סינון "הכל" לא הוחל');
      listTemplate = serializeForm(second.form);
      return expandGroups(second.doc);
    },

    async openSubCase(sub) {
      if (!listTemplate) throw new Error('loadAllCases must run first');
      const body = new URLSearchParams(listTemplate);
      body.set('FileID', sub.fileToken);
      body.set('hash', sub.fileHash);
      await pageText('FilesList.aspx', { method: 'POST', body });
    },

    async getDocuments(sub) {
      const { doc, form } = docOf((await pageText('FileDocuments.aspx')).text);
      const page = parseDocumentsPage(doc);
      if (!page.header.includes(sub.fullNo)) {
        throw new CaseMismatchError(`נפתח תיק אחר מהמצופה (${page.header || 'ללא כותרת'}) במקום ${sub.fullNo}`);
      }
      return { ...page, form: serializeForm(form) };
    },

    async downloadDocument(page, row) {
      const body = new URLSearchParams(page.form);
      body.set('DocumentNumber', row.docToken);
      body.set('DocumentNumberhash', row.docHash);
      const res = await send('DocViewer.ashx', { method: 'POST', body });
      const bytes = new Uint8Array(await res.arrayBuffer());
      const name = (res.headers.get('content-disposition') || '').match(/filename="?([^";]+)"?/i)?.[1];
      if (res.ok && bytes.length === 0) throw new DownloadError('השרת החזיר קובץ ריק — ייתכן שהמסמך חסר באתר בית הדין');
      if (!res.ok || !name) throw new DownloadError(`הורדה נכשלה (HTTP ${res.status}, ${bytes.length} בתים)`);
      return { bytes, serverName: name };
    },
  };
}
