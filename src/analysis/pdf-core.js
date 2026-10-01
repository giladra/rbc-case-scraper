const count = (s) => (s.match(/\S/g) || []).length;

export function createPdfProvider({ pdfjs, wasmUrl, ocrEngine = null, maxTextPages = 3, maxOcrPages = 1, minChars = 40 }) {
  return async function pdfProvider(bytes, { ocr = true } = {}) {
    const task = pdfjs.getDocument({
      data: bytes.slice(), useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0,
      ...(wasmUrl ? { wasmUrl } : {}),
    });
    const doc = await task.promise;
    try {
      let text = '';
      for (let i = 1; i <= Math.min(doc.numPages, maxTextPages); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let line = '';
        let y = null;
        for (const it of content.items) {
          if (y !== null && Math.abs(it.transform[5] - y) > 2) { text += line + '\n'; line = ''; }
          line += it.str;
          y = it.transform[5];
        }
        text += line + '\n';
      }
      if (count(text) >= minChars) return { text, hasTextLayer: true, ocr: null };
      if (!ocr || !ocrEngine) return { text, hasTextLayer: false, ocr: null };

      let ocrText = '';
      let confSum = 0;
      let pages = 0;
      for (let i = 1; i <= Math.min(doc.numPages, maxOcrPages); i++) {
        const page = await doc.getPage(i);
        const r = await ocrEngine.recognize(await ocrEngine.renderPage(page));
        ocrText += r.text + '\n';
        confSum += r.confidence;
        pages++;
      }
      return { text: ocrText, hasTextLayer: false, ocr: { used: true, confidence: pages ? Math.round(confSum / pages) : 0, pages } };
    } finally {
      await task.destroy();
    }
  };
}
