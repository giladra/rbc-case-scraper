import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import { buildFileName, folderFor, uniquePath } from '../src/output/naming.js';
import { buildIndexRow, buildFailureRow, toCsv, toJson } from '../src/output/index-writer.js';
import { buildZip } from '../src/output/zip.js';

const meta = (o = {}) => ({
  category: 'החלטות', kind: 'החלטה', headline: 'הבהרה בבקשה לדחיית מועד דיון', recipient: '', hearingDateIso: '', filer: 'בית הדין',
  filerRole: '', dateIso: '2026-06-14', bodyDateIso: '', hebrewDate: '', origin: 'מערכת שיר"ה', typeText: 'x', confidence: 'high', flags: [],
  hasTextLayer: true, ext: 'docx', serverName: '1001.DOCX', docId: '1001', ...o,
});
const sub = { mainNo: '1111111', subNo: '4', fullNo: '1111111/4', subject: 'חלוקת רכוש - כריכה' };

describe('buildFileName', () => {
  it('decision', () => {
    expect(buildFileName(meta())).toBe('2026-06-14_החלטה_הבהרה בבקשה לדחיית מועד דיון_בית הדין.docx');
  });
  it('request: kind omitted when headline starts with it; role appended', () => {
    const n = buildFileName(meta({ kind: 'בקשה', headline: 'בקשה לדחיית מועד דיון', filer: 'לוי עו"ד דוד', filerRole: 'ב"כ המשיב', ext: 'pdf' }));
    expect(n).toBe('2026-06-14_בקשה לדחיית מועד דיון_לוי עו״ד דוד (ב״כ המשיב).pdf');
  });
  it('summons: recipient and hearing date', () => {
    const n = buildFileName(meta({ kind: 'הזמנה לדיון שנדחה', headline: 'הזמנה לדיון שנדחה', recipient: 'שרה ישראלי', hearingDateIso: '2026-07-01' }));
    expect(n).toBe('2026-06-14_הזמנה לדיון שנדחה_עבור שרה ישראלי_דיון 2026-07-01_בית הדין.docx');
  });
  it('truncates headline to fit and never exceeds maxLen', () => {
    const n = buildFileName(meta({ headline: 'מילה '.repeat(60) }), 80);
    expect([...n].length).toBeLessThanOrEqual(80);
    expect(n.endsWith('_בית הדין.docx')).toBe(true);
  });
  it('missing date', () => {
    expect(buildFileName(meta({ dateIso: '' })).startsWith('ללא-תאריך_')).toBe(true);
  });
});

describe('folders and uniqueness', () => {
  it('folderFor', () => {
    expect(folderFor(sub, 'החלטות')).toBe('1111111/1111111-4 - חלוקת רכוש - כריכה/החלטות');
  });
  it('uniquePath adds doc id then counter', () => {
    const taken = new Set();
    expect(uniquePath('a/x.pdf', taken, '11')).toBe('a/x.pdf');
    expect(uniquePath('a/x.pdf', taken, '12')).toBe('a/x_12.pdf');
    expect(uniquePath('a/x.pdf', taken, '12')).toBe('a/x_12_2.pdf');
  });
});

describe('index', () => {
  const row = buildIndexRow(sub, 'p/x.docx', meta({ headline: 'כותרת, עם "מירכאות"', flags: ['needs-ocr', 'x'] }));
  it('row keys', () => {
    expect(row).toMatchObject({ subCase: '1111111/4', path: 'p/x.docx', category: 'החלטות', dateListed: '2026-06-14', flags: 'needs-ocr; x' });
  });
  it('csv has BOM, Hebrew header, escaped quotes, CRLF', () => {
    const csv = toCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')[0]).toContain('תיק משנה');
    expect(csv).toContain('"כותרת, עם ""מירכאות"""');
  });
  it('json round-trips', () => {
    expect(JSON.parse(toJson([row]))[0].subCase).toBe('1111111/4');
  });
  it('failure row', () => {
    const f = buildFailureRow(sub, { typeText: 'בקשה', dateIso: '2026-01-01', submitter: 'x', origin: 'חיצוני', hebrewDate: '' }, 'HTTP 500');
    expect(f.path).toBe('');
    expect(f.flags).toBe('download-failed: HTTP 500');
  });
});

describe('buildZip', () => {
  it('stores UTF-8 Hebrew paths', () => {
    const z = buildZip([{ path: '1/תיק/א.txt', bytes: new TextEncoder().encode('שלום') }]);
    const out = unzipSync(z);
    expect(Object.keys(out)).toEqual(['1/תיק/א.txt']);
    expect(new TextDecoder().decode(out['1/תיק/א.txt'])).toBe('שלום');
  });
});
