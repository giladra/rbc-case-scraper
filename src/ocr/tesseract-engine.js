import { createWorker } from 'tesseract.js';

export function createTesseractEngine({ workerPath, corePath, langPath }) {
  let workerP = null;
  const getWorker = () => (workerP ??= createWorker('heb', 1, {
    workerPath, corePath, langPath, gzip: false, cacheMethod: 'none', workerBlobURL: false,
  }));
  return {
    async renderPage(page) {
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
      return canvas;
    },
    async recognize(image) {
      const w = await getWorker();
      const { data } = await w.recognize(image);
      return { text: data.text, confidence: data.confidence };
    },
    async terminate() {
      if (workerP) (await workerP).terminate();
      workerP = null;
    },
  };
}
