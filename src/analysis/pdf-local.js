import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { createPdfProvider } from './pdf-core.js';

// Run pdf.js on the calling thread ("fake worker"): no Worker needed.
globalThis.pdfjsWorker = globalThis.pdfjsWorker ?? { WorkerMessageHandler: pdfWorker.WorkerMessageHandler };

export { pdfjs };
export const createLocalPdfProvider = (opts = {}) => createPdfProvider({ pdfjs, ...opts });
