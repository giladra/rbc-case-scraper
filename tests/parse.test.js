import { describe, it, expect } from 'vitest';
import { parse, listPage, docsPage, COMBO } from './helpers/html.js';
import { serializeForm, findForm } from '../src/site/form.js';
import { parseCaseList } from '../src/site/parse-list.js';
import { parseDocumentsPage } from '../src/site/parse-docs.js';

describe('serializeForm', () => {
  it('serializes enabled fields only, by attribute value', () => {
    const doc = parse(docsPage({ rows: [] }));
    const p = serializeForm(findForm(doc));
    expect(p.get('__VIEWSTATE')).toBe('VS2');
    expect(p.has('chk1')).toBe(false);
    expect(p.get('chk2')).toBe('on');
    expect(p.get('sel')).toBe('b');
    expect(p.get('ta')).toBe('hi');
    expect(p.has('dis')).toBe(false);
  });
  it('skips submit buttons', () => {
    const doc = parse(listPage({}));
    const p = serializeForm(findForm(doc));
    expect([...p.keys()].some((k) => k.endsWith('btnFindUserFiles'))).toBe(false);
    expect(p.get(COMBO)).toBe('פתוחים');
  });
});

describe('parseCaseList', () => {
  const subs = [
    { name: '2222222/1, צווים אחרים, שרה ישראלי, ישראל ישראלי', t3: 'T1', t4: '11', closed: '24/11/2020' },
    { name: '1111111/12, כינוס נכסים, ישראל ישראלי, שרה ישראלי', t3: 'T2', t4: '-22' },
    { name: '1111111/4, חלוקת רכוש - כריכה, ישראל ישראלי, שרה ישראלי', t3: 'T3', t4: '33', opened: '30/09/2020' },
  ];
  const mains = parseCaseList(parse(listPage({ subs })));
  it('groups by main case, sorted', () => {
    expect(mains.map((m) => m.mainNo)).toEqual(['1111111', '2222222']);
    expect(mains[0].subCases.map((s) => s.subNo)).toEqual(['4', '12']);
  });
  it('parses sub-case fields', () => {
    const s = mains[0].subCases[0];
    expect(s).toMatchObject({
      mainNo: '1111111', subNo: '4', fullNo: '1111111/4', subject: 'חלוקת רכוש - כריכה', parties: 'ישראל ישראלי, שרה ישראלי',
      openedIso: '2020-09-30', openedDisplay: '30/09/2020', court: 'ירושלים', isClosed: false, closedIso: '', fileToken: 'T3', fileHash: '33',
    });
  });
  it('closed sub-case', () => {
    const s = mains[1].subCases[0];
    expect(s.isClosed).toBe(true);
    expect(s.closedIso).toBe('2020-11-24');
  });
  it('main title from the group row', () => {
    expect(mains[0].title).toContain('אישות');
  });
});

describe('parseDocumentsPage', () => {
  const page = parseDocumentsPage(parse(docsPage({
    total: 2,
    rows: [
      { type: 'החלטה - הבהרה - בבקשה לדחיית מועד דיון', tok: 'AAA/+=', hash: '111111111' },
      { type: 'בקשה - בקשה לדחיית מועד דיון', submitter: 'לוי עו"ד דוד', origin: 'חיצוני', date: '11/06/2026', tok: 'BBB', hash: '-222222222' },
    ],
  })));
  it('header and total', () => {
    expect(page.header).toBe('מסמכים עבור תיק - 1111111/4, חלוקת רכוש');
    expect(page.total).toBe(2);
  });
  it('rows', () => {
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toMatchObject({ index: 0, typeText: 'החלטה - הבהרה - בבקשה לדחיית מועד דיון', submitter: '', dateIso: '2026-06-14', dateDisplay: '14/06/2026', hebrewDate: 'כ"ט סיון תשפ"ו', origin: 'מערכת שיר"ה', docToken: 'AAA/+=', docHash: '111111111' });
    expect(page.rows[1]).toMatchObject({ submitter: 'לוי עו"ד דוד', origin: 'חיצוני', docHash: '-222222222' });
  });
});
