import { normalize, splitDateCell } from '../shared/text.js';

const DOC_RE = /openDocViewer\("([^"]+)",\s*(-?\d+)\)/;

export function parseDocumentsPage(doc) {
  const text = doc.body?.textContent ?? '';
  // The innermost element whose text starts with the header phrase (robust to markup/whitespace differences).
  const headerEl = [...doc.querySelectorAll('*')]
    .filter((el) => /^\s*מסמכים עבור תיק/.test(el.textContent ?? ''))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  const header = normalize(headerEl?.textContent ?? '');
  const totalM = text.match(/סה"כ\s+(\d+)\s+פריטים/);
  const rows = [];
  for (const tr of doc.querySelectorAll('tr[id*="_DXDataRow"]')) {
    const cells = [...tr.children].filter((c) => c.tagName.toLowerCase() === 'td');
    const a = tr.querySelector('a[onclick*="openDocViewer"]');
    const m = a?.getAttribute('onclick').match(DOC_RE);
    if (!m) continue;
    const d = splitDateCell(cells[2]?.textContent ?? '');
    rows.push({
      index: rows.length, typeText: normalize(cells[0]?.textContent ?? ''), submitter: normalize(cells[1]?.textContent ?? ''),
      dateDisplay: d.display, dateIso: d.iso, hebrewDate: d.hebrew, origin: normalize(cells[3]?.textContent ?? ''),
      docToken: m[1], docHash: m[2],
    });
  }
  return { header, total: totalM ? Number(totalM[1]) : null, rows };
}
