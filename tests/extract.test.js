import { describe, it, expect } from 'vitest';
import { detectFormat, docxToText, extractText } from '../src/analysis/extract.js';
import { createLocalPdfProvider } from '../src/analysis/pdf-local.js';
import { makeDocx, makePdf } from './helpers/make-files.js';

const LONG = 'Hello world this is a petition about nothing important at all';
const fakeEngine = (calls) => ({
  renderPage: async () => 'IMG',
  recognize: async (img) => { calls.push(img); return { text: 'בקשה להחזר ערבות\nטקסט נוסף', confidence: 81 }; },
});

describe('detectFormat', () => {
  it('by magic bytes', () => {
    expect(detectFormat(makeDocx(['x']))).toBe('docx');
    expect(detectFormat(makePdf('hi'))).toBe('pdf');
    expect(detectFormat(new Uint8Array([1, 2, 3, 4]))).toBe('unknown');
  });
});

describe('docxToText', () => {
  it('keeps Hebrew, paragraphs, and decodes entities', () => {
    expect(docxToText(makeDocx(['החלטה', 'א & ב <ג>'])).split('\n')).toEqual(['החלטה', 'א & ב <ג>', '']);
  });
});

describe('extractText', () => {
  it('docx with enough text has a text layer', async () => {
    const r = await extractText(makeDocx(['החלטה בעניין חלוקת רכוש כריכה ועוד מילים רבות']));
    expect(r).toMatchObject({ format: 'docx', hasTextLayer: true, ocr: null });
    expect(r.text).toContain('החלטה');
  });
  it('pdf with a text layer never calls OCR', async () => {
    const calls = [];
    const pdfProvider = createLocalPdfProvider({ ocrEngine: fakeEngine(calls) });
    const r = await extractText(makePdf(LONG), { pdfProvider });
    expect(r).toMatchObject({ format: 'pdf', hasTextLayer: true, ocr: null });
    expect(r.text).toContain('Hello world');
    expect(calls).toHaveLength(0);
  });
  it('blank pdf without an OCR engine: no text layer, ocr null', async () => {
    const r = await extractText(makePdf(''), { pdfProvider: createLocalPdfProvider() });
    expect(r).toMatchObject({ format: 'pdf', hasTextLayer: false, ocr: null });
  });
  it('blank pdf with an OCR engine: OCR text + confidence', async () => {
    const calls = [];
    const r = await extractText(makePdf(''), { pdfProvider: createLocalPdfProvider({ ocrEngine: fakeEngine(calls) }) });
    expect(r).toMatchObject({ hasTextLayer: false, ocr: { used: true, confidence: 81, pages: 1 } });
    expect(r.text).toContain('בקשה להחזר ערבות');
    expect(calls).toEqual(['IMG']);
  });
  it('ocr:false skips the engine', async () => {
    const calls = [];
    const r = await extractText(makePdf(''), { pdfProvider: createLocalPdfProvider({ ocrEngine: fakeEngine(calls) }), ocr: false });
    expect(r.ocr).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('pdf without a provider reports an error, never throws', async () => {
    const r = await extractText(makePdf(LONG));
    expect(r).toMatchObject({ format: 'pdf', hasTextLayer: false, error: 'no-pdf-provider' });
  });
  it('garbage pdf never throws', async () => {
    const r = await extractText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0]), { pdfProvider: createLocalPdfProvider() });
    expect(r.hasTextLayer).toBe(false);
    expect(r.error).toBeTruthy();
  });
  it('unknown format', async () => {
    expect(await extractText(new Uint8Array([1, 2, 3, 4]))).toMatchObject({ format: 'unknown', hasTextLayer: false });
  });
});
