// The PDF host lives in a hidden, cross-origin iframe. Chrome does not deliver requestAnimationFrame callbacks
// to such frames, and pdf.js schedules page rendering with it — OCR (which renders the page first) would hang.
// Timers keep running, so route rAF through setTimeout. This module must be imported before pdf.js.
if (typeof window !== 'undefined') {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}
