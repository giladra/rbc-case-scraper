const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const NIQQUD = /[\u0591-\u05c7]/g;
const ILLEGAL = /[<>:"/\|?*\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function normalize(s) {
  return String(s ?? '')
    .replace(BIDI, '')
    .replace(NIQQUD, '')
    .replace(/[\u05f4\u201c\u201d]/g, '"')
    .replace(/[\u05f3\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizePart(s) {
  let t = normalize(s).replace(/"/g, '\u05f4').replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (RESERVED.test(t)) t = '_' + t;
  return t;
}

export function truncate(s, max) {
  const chars = [...String(s)];
  return chars.length <= max ? String(s) : chars.slice(0, max).join('').trim();
}

export function dmyToIso(s) {
  const m = String(s ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function splitDateCell(text) {
  const t = normalize(text);
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return { display: '', iso: '', hebrew: t };
  return { display: m[0], iso: `${m[3]}-${m[2]}-${m[1]}`, hebrew: t.replace(m[0], '').trim() };
}
