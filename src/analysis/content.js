import { normalize, dmyToIso } from '../shared/text.js';
import { CATEGORY } from './classify.js';

const ROLE = '(?:התובעת|התובע|הנתבעת|הנתבע|המערערת|המערער|המשיבה|המשיב|המבקשת|המבקש|העוררת|העורר|האישה לשעבר|הבעל לשעבר|האישה|האיש|הבעל)';
const ROLE_LINE = new RegExp(`^(${ROLE})\\s*:\\s*(.*)$`);
const COUNSEL = /^\(?\s*ע"י\s+ב"כ,?\s*(.*?)\)?$/;
const TITLES = [
  [CATEGORY.DECISIONS, /^(?:החלטה|פסק דין|פסק-דין)$/],
  [CATEGORY.SUMMONS, /^הזמנה לבית הדין/],
  [CATEGORY.PROTOCOLS, /^פרוטוקול/],
  [CATEGORY.FILINGS, /^(?:בקשה|כתב תביעה|כתב הגנה|תגובה|ערעור)$/],
];
const FILING_TITLE = /^(?:בקשה|בקשת|הודעה|הודעת|תגובה|תשובה|ערעור|עתירה|כתב|בר"ע|השלמת|סיכומים)\s+\S.{0,60}$/;

function cleanName(s) {
  return s.replace(/,?\s*נושאת?\s*ת"ז.*$/, '').replace(/\s*ת"ז.*$/, '').trim();
}

export function analyzeContent(rawText) {
  const lines = String(rawText ?? '').split(/\r?\n/).map(normalize).filter(Boolean);
  const joined = lines.join('\n');
  const info = {
    lines, caseNo: '', courtName: '', judges: [], parties: [], subjectLine: '', titleCategory: null,
    afterTitle: '', afterParties: '', filingTitle: '', givenDateIso: '', signedDateIso: '', hearingDateIso: '',
  };

  info.caseNo = (joined.match(/(\d{4,8}\/\d+)/) || [])[1] ?? '';
  info.courtName = (joined.match(/ב?בית הדין הרבני (?:האזורי|הגדול)(?: [^\s:]+)?/) || [''])[0].trim();

  const jIdx = lines.findIndex((l) => /^לפני כבוד הדיינים/.test(l));
  if (jIdx >= 0) {
    for (let i = jIdx + 1; i < lines.length && info.judges.length < 3; i++) {
      if (/:$/.test(lines[i]) || /^(?:ת"ז|נגד|-נגד-)/.test(lines[i])) break;
      info.judges.push(lines[i]);
    }
  }

  let lastPartyEnd = -1;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const m = lines[i].match(ROLE_LINE);
    if (!m) continue;
    let name = m[2];
    let j = i;
    if (!name) { name = lines[i + 1] ?? ''; j = i + 1; }
    const party = { role: m[1], name: cleanName(name), counsel: '' };
    for (let k = j + 1; k < Math.min(lines.length, j + 5); k++) {
      if (ROLE_LINE.test(lines[k])) break;
      const c = lines[k].match(COUNSEL);
      if (c) { party.counsel = c[1].replace(/\)$/, '').trim(); lastPartyEnd = k; break; }
    }
    if (lastPartyEnd < j) lastPartyEnd = j;
    info.parties.push(party);
  }
  if (lastPartyEnd >= 0) {
    const next = lines.slice(lastPartyEnd + 1).find((l) => !ROLE_LINE.test(l) && !/^-?נגד-?$/.test(l) && !COUNSEL.test(l));
    info.afterParties = next ?? '';
  }

  info.subjectLine = (joined.match(/^הנדון:\s*(.+)$/m) || joined.match(/בנושא:\s*(.+)$/m) || [])[1]?.trim() ?? '';

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const hit = TITLES.find(([, re]) => re.test(lines[i]));
    if (hit) {
      info.titleCategory = hit[0];
      info.afterTitle = lines[i + 1] ?? '';
      break;
    }
  }

  info.filingTitle = lines.slice(0, 40).find((l) => FILING_TITLE.test(l)) ?? '';
  info.givenDateIso = dmyToIso((joined.match(/ניתן ביום[^\n(]*\((\d{2}\/\d{2}\/\d{4})\)/) || [])[1]);
  info.signedDateIso = dmyToIso((joined.match(/נחתם דיגיטלית[^\n]*?בתאריך\s+(\d{2}\/\d{2}\/\d{4})/) || [])[1]);
  info.hearingDateIso = dmyToIso((joined.match(/לישיבה שתתקיים ביום[^\n(]*\((\d{2}\/\d{2}\/\d{4})\)/) || [])[1]);
  return info;
}

export function inferFilerRole(parties, submitter) {
  const tokens = normalize(submitter).split(' ').filter((t) => t.length > 1 && !/^עו"?ד$/.test(t));
  if (!tokens.length) return '';
  for (const p of parties) {
    if (p.counsel && tokens.every((t) => normalize(p.counsel).includes(t))) return `ב"כ ${p.role}`;
  }
  for (const p of parties) {
    if (tokens.every((t) => normalize(p.name).includes(t))) return p.role;
  }
  return '';
}
