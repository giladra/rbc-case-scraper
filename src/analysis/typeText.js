import { normalize, dmyToIso } from '../shared/text.js';

const SEP = /\s+[-–]\s+/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

export function parseTypeText(raw) {
  const text = normalize(raw);
  const segments = text.split(SEP).map((s) => s.trim()).filter(Boolean);
  const head = segments[0] ?? '';
  const out = { text, head, segments, headline: '', recipient: '', hearingDateIso: '' };
  if (/^הזמנה/.test(head)) {
    out.headline = head;
    const rest = segments.slice(1);
    const dateSeg = rest.find((s) => DATE.test(s));
    if (dateSeg) out.hearingDateIso = dmyToIso(dateSeg);
    out.recipient = rest.filter((s) => s !== dateSeg).join(' - ');
  } else if (/^החלטה$/.test(head) || /^בקשה$/.test(head)) {
    out.headline = segments.slice(1).join(' ');
  } else {
    out.headline = text;
  }
  return out;
}
