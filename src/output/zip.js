import { zipSync } from 'fflate';

export function buildZip(entries) {
  const files = {};
  for (const e of entries) files[e.path] = [e.bytes, { level: 0 }];
  return zipSync(files);
}
