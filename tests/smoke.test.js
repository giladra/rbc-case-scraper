import { it, expect } from 'vitest';
import fs from 'node:fs';
it('manifest is MV3 and scoped to the list page', () => {
  const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  expect(m.manifest_version).toBe(3);
  // Tesseract and pdf.js decoders are WebAssembly; MV3 blocks it unless the extension CSP allows it (found by tools/ext-test.mjs).
  expect(m.content_security_policy.extension_pages).toContain("'wasm-unsafe-eval'");
  expect(m.content_scripts[0].matches).toEqual(['https://sides.rbc.gov.il/Pages/FilesList.aspx*']);
});
