const COLUMNS = [
  ['subCase', 'תיק משנה'], ['path', 'נתיב בקובץ'], ['serverName', 'שם מקורי'], ['docId', 'מזהה מסמך'],
  ['category', 'קטגוריה'], ['kind', 'סוג'], ['headline', 'כותרת'], ['recipient', 'נמען'], ['hearingDate', 'תאריך דיון'],
  ['filer', 'מגיש'], ['filerRole', 'תפקיד המגיש'], ['dateListed', 'תאריך קבלה (ברשימה)'], ['dateBody', 'תאריך במסמך'],
  ['hebrewDate', 'תאריך עברי'], ['origin', 'מקור'], ['typeText', 'סוג מסמך (מקור)'], ['confidence', 'רמת ביטחון'], ['flags', 'הערות'],
];

export function buildIndexRow(sub, path, meta) {
  return {
    subCase: sub.fullNo, path, serverName: meta.serverName, docId: meta.docId, category: meta.category, kind: meta.kind,
    headline: meta.headline, recipient: meta.recipient, hearingDate: meta.hearingDateIso, filer: meta.filer,
    filerRole: meta.filerRole, dateListed: meta.dateIso, dateBody: meta.bodyDateIso, hebrewDate: meta.hebrewDate,
    origin: meta.origin, typeText: meta.typeText, confidence: meta.confidence, flags: meta.flags.join('; '),
  };
}

export function buildFailureRow(sub, row, message) {
  return {
    subCase: sub.fullNo, path: '', serverName: '', docId: '', category: '', kind: '', headline: row.typeText, recipient: '',
    hearingDate: '', filer: row.submitter, filerRole: '', dateListed: row.dateIso, dateBody: '', hebrewDate: row.hebrewDate,
    origin: row.origin, typeText: row.typeText, confidence: 'low', flags: `download-failed: ${message}`,
  };
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = COLUMNS.map(([, h]) => esc(h)).join(',');
  const body = rows.map((r) => COLUMNS.map(([k]) => esc(r[k])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

export function toJson(rows) {
  return JSON.stringify(rows, null, 2);
}
