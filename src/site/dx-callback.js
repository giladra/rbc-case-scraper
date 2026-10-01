// DevExpress ASPxGridView callback helpers (format captured from the live site, 2026-10-01).

// Param for "expand the group row whose visible index is `index`" (all groups collapsed):
//   c0:GB|<len>;9|EXPANDROW<digits>|<index>5|false;   where <len> = length of everything between ';' and the final ';'
export function expandRowParam(index) {
  const idx = String(index);
  const payload = `9|EXPANDROW${idx.length}|${idx}5|false`;
  return `c0:GB|${payload.length};${payload};`;
}

const SIMPLE = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

// The reply looks like:  0|/*DX*/({'id':0,'result':'<escaped html>','stateObject':{...}})
export function parseCallbackHtml(text) {
  const key = "'result':'";
  const start = text.indexOf(key);
  if (start < 0) throw new Error('תשובת הטבלה מהאתר לא זוהתה');
  let out = '';
  for (let i = start + key.length; i < text.length;) {
    const ch = text[i];
    if (ch === '\\') {
      const n = text[i + 1];
      if (n === 'u') { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
      if (n === 'x') { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16)); i += 4; continue; }
      out += SIMPLE[n] ?? n;
      i += 2;
      continue;
    }
    if (ch === "'") return out;
    out += ch;
    i++;
  }
  throw new Error('תשובת הטבלה מהאתר נקטעה');
}
