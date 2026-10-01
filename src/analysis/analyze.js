import { parseTypeText } from './typeText.js';
import { classify, CATEGORY } from './classify.js';
import { analyzeContent, inferFilerRole } from './content.js';
import { extractText } from './extract.js';
import { truncate } from '../shared/text.js';

const OCR_MIN_CONFIDENCE = 60;

function extOf(serverName, format) {
  const m = String(serverName ?? '').match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : format !== 'unknown' ? format : 'bin';
}

export async function analyzeDocument({ row, bytes, serverName }, { pdfProvider, ocr = true } = {}) {
  const typeInfo = parseTypeText(row.typeText);
  const ex = await extractText(bytes, { pdfProvider, ocr });
  const ocrUsed = !!ex.ocr;
  const ocrOk = ocrUsed && ex.ocr.confidence >= OCR_MIN_CONFIDENCE;
  const usable = ex.hasTextLayer || ocrOk;
  const content = usable ? analyzeContent(ex.text) : null;
  const cls = classify({ typeInfo, content: ocrUsed ? null : content, hasTextLayer: usable });
  const flags = [...cls.flags];
  if (ocrUsed) flags.push(ocrOk ? 'ocr' : 'ocr-low-confidence');
  if (ex.format === 'unknown') flags.push('unsupported-format');
  if (ex.error) flags.push(`extract-failed: ${truncate(ex.error, 80)}`);

  let headline = typeInfo.headline;
  if (!headline && content) {
    const body = cls.category === CATEGORY.DECISIONS ? content.afterTitle : content.filingTitle;
    if (body && body.split(' ').length <= 14) { headline = truncate(body, 70); flags.push('headline-from-body'); }
  }
  if (!headline) { headline = typeInfo.head; flags.push('no-headline'); }

  const origin = row.origin ?? '';
  const filer = row.submitter || (origin.includes('שיר') ? 'בית הדין' : origin.includes('חיצוני') ? 'גורם חיצוני' : '');
  const filerRole = row.submitter && content ? inferFilerRole(content.parties, row.submitter) : '';
  const trusted = content && !ocrUsed ? content : null;

  return {
    category: cls.category,
    kind: truncate(typeInfo.head, 30),
    headline,
    recipient: typeInfo.recipient,
    hearingDateIso: typeInfo.hearingDateIso || trusted?.hearingDateIso || '',
    filer,
    filerRole,
    dateIso: row.dateIso,
    bodyDateIso: trusted ? trusted.signedDateIso || trusted.givenDateIso || '' : '',
    hebrewDate: row.hebrewDate,
    origin,
    typeText: row.typeText,
    confidence: cls.confidence,
    flags,
    hasTextLayer: ex.hasTextLayer,
    ext: extOf(serverName, ex.format),
    serverName,
    docId: (String(serverName ?? '').match(/^(\d+)/) || [])[1] ?? '',
  };
}
