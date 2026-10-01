import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/analysis/analyze.js';
import { CATEGORY } from '../src/analysis/classify.js';
import { createLocalPdfProvider } from '../src/analysis/pdf-local.js';
import { makeDocx, makePdf } from './helpers/make-files.js';

const row = (o) => ({ index: 0, typeText: '', submitter: '', dateDisplay: '14/06/2026', dateIso: '2026-06-14', hebrewDate: 'כ"ט סיון תשפ"ו', origin: 'מערכת שיר"ה', docToken: 't', docHash: '1', ...o });
const DECISION = ['ב"ה', 'תיק 1111111/4', 'בבית הדין הרבני האזורי ירושלים', 'התובע:', 'ישראל ישראלי', '(ע"י ב"כ עו"ד דן כהן)', 'הנדון: חלוקת רכוש', 'החלטה', 'לאחר העיון בהודעה ביה"ד מבהיר כי הדיון יידחה', 'ניתן ביום (14/06/2026).'];
const plain = { pdfProvider: createLocalPdfProvider() };
const ocrOf = (text, confidence) => ({
  pdfProvider: createLocalPdfProvider({ ocrEngine: { renderPage: async () => 'IMG', recognize: async () => ({ text, confidence }) } }),
});

describe('analyzeDocument', () => {
  it('court decision DOCX', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'החלטה - הבהרה - בבקשה לדחיית מועד דיון' }), bytes: makeDocx(DECISION), serverName: '5550001.DOCX' }, plain);
    expect(m).toMatchObject({
      category: CATEGORY.DECISIONS, kind: 'החלטה', headline: 'הבהרה בבקשה לדחיית מועד דיון', filer: 'בית הדין',
      dateIso: '2026-06-14', bodyDateIso: '2026-06-14', ext: 'docx', docId: '5550001', confidence: 'high', hasTextLayer: true,
    });
    expect(m.flags).toEqual([]);
  });

  it('external scanned PDF without OCR is metadata-only and flagged', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה - בקשה לקבלת ארכה', submitter: 'שגיא עומר', origin: 'חיצוני' }), bytes: makePdf(''), serverName: '5550003.PDF' }, plain);
    expect(m).toMatchObject({ category: CATEGORY.FILINGS, headline: 'בקשה לקבלת ארכה', filer: 'שגיא עומר', filerRole: '', ext: 'pdf', hasTextLayer: false });
    expect(m.flags).toContain('needs-ocr');
    expect(m.confidence).toBe('medium');
  });

  it('scanned PDF with good OCR: headline + role from OCR, no dates from OCR', async () => {
    const text = ['בבית הדין הרבני הגדול', 'המערער: ישראל ישראלי', '(ע"י ב"כ עו"ד דן כהן)', 'בקשה להחזר ערבות', 'ניתן ביום (30/04/2071) ונחתם דיגיטלית בתאריך 01/01/2071'].join('\n');
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה', submitter: 'כהן עו"ד דן', origin: 'חיצוני' }), bytes: makePdf(''), serverName: '5.PDF' }, ocrOf(text, 85));
    expect(m.headline).toBe('בקשה להחזר ערבות');
    expect(m.filerRole).toBe('ב"כ המערער');
    expect(m.bodyDateIso).toBe('');
    expect(m.flags).toEqual(expect.arrayContaining(['ocr', 'headline-from-body']));
    expect(m.flags).not.toContain('needs-ocr');
  });

  it('scanned PDF with poor OCR is treated as unusable', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה', submitter: 'פלוני', origin: 'חיצוני' }), bytes: makePdf(''), serverName: '6.PDF' }, ocrOf('בקשה להחזר ערבות', 40));
    expect(m.headline).toBe('בקשה');
    expect(m.flags).toEqual(expect.arrayContaining(['ocr-low-confidence', 'needs-ocr', 'no-headline']));
  });

  it('summons carries recipient and hearing date', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'הזמנה לביה"ד - יעל ברק - 24/06/2026' }), bytes: makeDocx(['הזמנה לבית הדין הרבני', 'בנושא: משהו']), serverName: '5550002.DOCX' }, plain);
    expect(m).toMatchObject({ category: CATEGORY.SUMMONS, recipient: 'יעל ברק', hearingDateIso: '2026-06-24', headline: 'הזמנה לביה"ד' });
  });

  it('bare filing in a DOCX takes its title from the body', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה', submitter: 'פלוני', origin: 'חיצוני' }), bytes: makeDocx(['בבית הדין הרבני הגדול', 'המערער: ישראל ישראלי', 'בקשה להחזר ערבות', 'טענות רבות וארוכות מאוד כאן']), serverName: '7.DOCX' }, plain);
    expect(m.headline).toBe('בקשה להחזר ערבות');
    expect(m.flags).toContain('headline-from-body');
  });

  it('bare filing with no usable title keeps the type and flags it', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה', submitter: 'פלוני', origin: 'חיצוני' }), bytes: makePdf('Plain English petition text long enough to count as a text layer for sure'), serverName: '1.PDF' }, plain);
    expect(m.headline).toBe('בקשה');
    expect(m.flags).toContain('no-headline');
  });

  it('filer role from party counsel (text layer)', async () => {
    const text = ['בבית הדין הרבני הגדול', 'המערער:', 'ישראל ישראלי', '(ע"י ב"כ עו"ד דן כהן)', 'הנדון: x', 'בקשה', 'טענות רבות וארוכות מאוד כאן'];
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה - בקשה כלשהי', submitter: 'כהן עו"ד דן', origin: 'חיצוני' }), bytes: makeDocx(text), serverName: '2.DOCX' }, plain);
    expect(m.filerRole).toBe('ב"כ המערער');
  });

  it('extraction errors carry their message in the flag', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה - x' }), bytes: makePdf(''), serverName: '4.PDF' }, { pdfProvider: async () => { throw new Error('host timeout'); } });
    expect(m.flags).toContain('extract-failed: host timeout');
  });

  it('unknown bytes are flagged, not thrown', async () => {
    const m = await analyzeDocument({ row: row({ typeText: 'בקשה - x' }), bytes: new Uint8Array([1, 2, 3, 4]), serverName: '3.DOC' }, plain);
    expect(m.flags).toContain('unsupported-format');
    expect(m.ext).toBe('doc');
  });
});
