import { unzipSync, strFromU8 } from 'fflate';

const count = (s) => (s.match(/\S/g) || []).length;

export function detectFormat(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'docx';
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  return 'unknown';
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function docxToText(bytes) {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  const xml = strFromU8(files['word/document.xml']);
  return xml
    .split('</w:p>')
    .map((p) => {
      let line = '';
      for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
        line += m[1] !== undefined ? m[1] : m[0].startsWith('<w:tab') ? '\t' : ' ';
      }
      return decodeXml(line);
    })
    .join('\n');
}

export async function extractText(bytes, { pdfProvider, ocr = true } = {}) {
  const format = detectFormat(bytes);
  try {
    if (format === 'docx') {
      const text = docxToText(bytes);
      return { format, text, hasTextLayer: count(text) >= 20, ocr: null };
    }
    if (format === 'pdf') {
      if (!pdfProvider) return { format, text: '', hasTextLayer: false, ocr: null, error: 'no-pdf-provider' };
      const r = await pdfProvider(bytes, { ocr });
      return { format, text: r.text, hasTextLayer: r.hasTextLayer, ocr: r.ocr ?? null };
    }
    return { format, text: '', hasTextLayer: false, ocr: null };
  } catch (e) {
    return { format, text: '', hasTextLayer: false, ocr: null, error: String(e?.message ?? e) };
  }
}
