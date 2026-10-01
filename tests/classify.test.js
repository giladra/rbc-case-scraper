import { describe, it, expect } from 'vitest';
import { parseTypeText } from '../src/analysis/typeText.js';
import { classify, CATEGORY } from '../src/analysis/classify.js';

describe('parseTypeText', () => {
  it('decision: headline joins the sub-segments', () => {
    const t = parseTypeText('החלטה - הבהרה - בבקשה לדחיית מועד דיון');
    expect(t.head).toBe('החלטה');
    expect(t.headline).toBe('הבהרה בבקשה לדחיית מועד דיון');
  });
  it('request: headline is the request title', () => {
    expect(parseTypeText('בקשה - בקשה לקבלת ארכה').headline).toBe('בקשה לקבלת ארכה');
  });
  it('bare decision/request have empty headline', () => {
    expect(parseTypeText('החלטה').headline).toBe('');
    expect(parseTypeText('בקשה').headline).toBe('');
  });
  it('summons: recipient and hearing date', () => {
    const t = parseTypeText('הזמנה לדיון שנדחה - שרה ישראלי - 01/07/2026');
    expect(t.headline).toBe('הזמנה לדיון שנדחה');
    expect(t.recipient).toBe('שרה ישראלי');
    expect(t.hearingDateIso).toBe('2026-07-01');
  });
  it('other types: whole text is the headline', () => {
    expect(parseTypeText('תשובה לערעור').headline).toBe('תשובה לערעור');
    expect(parseTypeText('יפוי כח').headline).toBe('יפוי כח');
  });
});

describe('classify (metadata)', () => {
  const c = (raw, content = null, hasTextLayer = true) => classify({ typeInfo: parseTypeText(raw), content, hasTextLayer });
  it.each([
    ['החלטה - ריבוי החלטות', CATEGORY.DECISIONS],
    ['הזמנה לביה"ד - יעל ברק - 24/06/2026', CATEGORY.SUMMONS],
    ['הזמנה לדיון שנדחה - יעל ברק - 01/07/2026', CATEGORY.SUMMONS],
    ['בקשה - בקשה לדחיית מועד דיון', CATEGORY.FILINGS],
    ['בקשת רשות ערעור', CATEGORY.FILINGS],
    ['תשובה לערעור', CATEGORY.FILINGS],
    ['תגובה', CATEGORY.FILINGS],
    ['יפוי כח', CATEGORY.ADMIN],
    ['פרוטוקול דיון', CATEGORY.PROTOCOLS],
    ['נספחים א-ו', CATEGORY.ATTACHMENTS],
    ['נספח לתגובה 1.', CATEGORY.ATTACHMENTS],
    ['נספח לבקשה- החלטת ביהה"ד האזורי', CATEGORY.ATTACHMENTS],
    ['טופס ריק', CATEGORY.ADMIN],
    ['טופס המצאת כתבי בית דין במייל', CATEGORY.ADMIN],
    ['הנחיות להפקדת ערובה', CATEGORY.ADMIN],
    ['אישור מהבנק', CATEGORY.ADMIN],
    ['קבלה', CATEGORY.ADMIN],
  ])('%s -> %s', (raw, cat) => {
    expect(c(raw).category).toBe(cat);
  });
  it('unknown type with no content is unclassified/low', () => {
    const r = c('מסמך מוזר');
    expect(r.category).toBe(CATEGORY.UNCLASSIFIED);
    expect(r.confidence).toBe('low');
    expect(r.flags).toContain('unclassified');
  });
});

describe('classify (content cross-check)', () => {
  it('agreement -> high', () => {
    const r = classify({ typeInfo: parseTypeText('החלטה - ריבוי החלטות'), content: { titleCategory: CATEGORY.DECISIONS }, hasTextLayer: true });
    expect(r).toMatchObject({ category: CATEGORY.DECISIONS, confidence: 'high', flags: [] });
  });
  it('disagreement keeps metadata, flags mismatch, medium', () => {
    const r = classify({ typeInfo: parseTypeText('בקשה - x'), content: { titleCategory: CATEGORY.DECISIONS }, hasTextLayer: true });
    expect(r.category).toBe(CATEGORY.FILINGS);
    expect(r.confidence).toBe('medium');
    expect(r.flags).toContain('type-mismatch');
  });
  it('annexes legitimately contain other documents: no mismatch flag', () => {
    const r = classify({ typeInfo: parseTypeText('נספח לבקשה'), content: { titleCategory: CATEGORY.DECISIONS }, hasTextLayer: true });
    expect(r).toMatchObject({ category: CATEGORY.ATTACHMENTS, confidence: 'medium', flags: [] });
  });
  it('no text layer -> needs-ocr flag, medium', () => {
    const r = classify({ typeInfo: parseTypeText('בקשה - בקשה לקבלת ארכה'), content: null, hasTextLayer: false });
    expect(r.flags).toContain('needs-ocr');
    expect(r.confidence).toBe('medium');
  });
  it('content-only classification is low', () => {
    const r = classify({ typeInfo: parseTypeText('מסמך מוזר'), content: { titleCategory: CATEGORY.PROTOCOLS }, hasTextLayer: true });
    expect(r).toMatchObject({ category: CATEGORY.PROTOCOLS, confidence: 'low' });
    expect(r.flags).toContain('classified-from-content');
  });
});
