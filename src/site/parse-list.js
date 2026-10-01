import { normalize, splitDateCell } from '../shared/text.js';

const OPEN_RE = /openFileDetails\("([^"]+)",\s*"([^"]+)"\)/;
const NAME_RE = /^(\d+)\/(\d+)\s*,\s*(.*)$/s;

export function parseCaseList(doc) {
  const groups = [...doc.querySelectorAll('tr[id*="grdFilesView_DXGroupRow"]')].map((r) => normalize(r.textContent));
  const byMain = new Map();
  for (const tr of doc.querySelectorAll('tr[id*="grdFilesView_DXDataRow"]')) {
    const cells = [...tr.children].filter((c) => c.tagName.toLowerCase() === 'td');
    const a = tr.querySelector('a[onclick*="openFileDetails"]');
    if (!a) continue;
    const tok = a.getAttribute('onclick').match(OPEN_RE);
    const nm = normalize(a.textContent).match(NAME_RE);
    if (!tok || !nm) continue;
    const [, mainNo, subNo, rest] = nm;
    const comma = rest.indexOf(',');
    const subject = (comma < 0 ? rest : rest.slice(0, comma)).trim();
    const parties = comma < 0 ? '' : rest.slice(comma + 1).trim();
    const opened = splitDateCell(cells[2]?.textContent ?? '');
    const closed = splitDateCell(cells[5]?.textContent ?? '');
    const sub = {
      mainNo, subNo, fullNo: `${mainNo}/${subNo}`, subject, parties,
      openedIso: opened.iso, openedDisplay: opened.display, openedHebrew: opened.hebrew,
      court: normalize(cells[3]?.textContent ?? ''), closedIso: closed.iso, isClosed: !!closed.iso,
      lastActivity: normalize(cells[7]?.textContent ?? ''), fileToken: tok[1], fileHash: tok[2],
    };
    if (!byMain.has(mainNo)) byMain.set(mainNo, { mainNo, title: groups.find((g) => g.includes(mainNo)) ?? mainNo, subCases: [] });
    byMain.get(mainNo).subCases.push(sub);
  }
  const mains = [...byMain.values()].sort((a, b) => a.mainNo.localeCompare(b.mainNo, 'en', { numeric: true }));
  for (const m of mains) m.subCases.sort((a, b) => Number(a.subNo) - Number(b.subNo));
  return mains;
}
