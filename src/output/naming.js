import { sanitizePart, truncate } from '../shared/text.js';

export function buildFileName(meta, maxLen = 120) {
  const ext = meta.ext ? '.' + meta.ext : '';
  const date = meta.dateIso || 'ללא-תאריך';
  const headlineRaw = meta.headline || '';
  const kind = meta.kind && !headlineRaw.startsWith(meta.kind) ? sanitizePart(meta.kind) : '';
  const tail = [];
  if (meta.recipient) tail.push(sanitizePart('עבור ' + meta.recipient));
  if (meta.hearingDateIso) tail.push('דיון ' + meta.hearingDateIso);
  const filer = [meta.filer, meta.filerRole && `(${meta.filerRole})`].filter(Boolean).join(' ');
  if (filer) tail.push(sanitizePart(filer));
  const fixed = [date, kind, ...tail].filter(Boolean).join('_');
  const budget = Math.max(15, maxLen - [...ext].length - [...fixed].length - 1);
  const headline = truncate(sanitizePart(headlineRaw), budget);
  return [date, kind, headline, ...tail].filter(Boolean).join('_') + ext;
}

export function folderFor(sub, category) {
  const subDir = `${sub.fullNo.replace(/\//g, '-')} - ${sanitizePart(sub.subject)}`;
  return `${sub.mainNo}/${subDir}/${category}`;
}

export function uniquePath(path, taken, docId) {
  const dot = path.lastIndexOf('.');
  const hasExt = dot > path.lastIndexOf('/');
  const base = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : '';
  let candidate = path;
  if (taken.has(candidate) && docId) candidate = `${base}_${docId}${ext}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${docId ? docId + '_' : ''}${n}${ext}`;
  taken.add(candidate);
  return candidate;
}
