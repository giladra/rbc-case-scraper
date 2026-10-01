import { describe, it, expect } from 'vitest';
import { analyzeContent, inferFilerRole } from '../src/analysis/content.js';
import { CATEGORY } from '../src/analysis/classify.js';

const DECISION = `ב"ה
תיק 1111111/4
 בבית הדין הרבני האזורי ירושלים
לפני כבוד הדיינים:
הרב פלוני אלמוני – ראב"ד
התובע:
ישראל ישראלי
ת"ז
000000018
(ע"י ב"כ עו"ד דן כהן ועו"ד רות לוי)
נגד
הנתבעת:
שרה ישראלי
ת"ז
000000026
(ע"י ב"כ עו"ד משה לוי)
הנדון: חלוקת רכוש - כריכה
החלטה
לאחר העיון בהודעה, ביה"ד מבהיר כי הדיון יידחה.
ניתן ביום ט"ז בתמוז התשפ"ו (01/07/2026).
הרב פלוני אלמוני
העתק מתאים למקור
נחתם דיגיטלית ע"י הרב פלוני אלמוני בתאריך 02/07/2026 09:42`;

const SUMMONS = `בית הדין הרבני האזורי ירושלים
תיק מספר:
1111111/12, כינוס נכסים, ישראל ישראלי, שרה ישראלי
ב"ה     אל:  שרה ישראלי
הזמנה לבית הדין הרבני                                          בנושא: חלוקת רכוש - כריכה
הנך מוזמן בזה להופיע בביה"ד הנ"ל לישיבה שתתקיים ביום רביעי ט"ז בתמוז התשפ"ו (01/07/2026) בשעה 10:00 באולם 7.`;

describe('analyzeContent - court decision DOCX', () => {
  const c = analyzeContent(DECISION);
  it('reads header facts', () => {
    expect(c.caseNo).toBe('1111111/4');
    expect(c.courtName).toBe('בבית הדין הרבני האזורי ירושלים');
    expect(c.judges).toEqual(['הרב פלוני אלמוני – ראב"ד']);
    expect(c.subjectLine).toBe('חלוקת רכוש - כריכה');
  });
  it('reads parties with counsel', () => {
    expect(c.parties).toEqual([
      { role: 'התובע', name: 'ישראל ישראלי', counsel: 'עו"ד דן כהן ועו"ד רות לוי' },
      { role: 'הנתבעת', name: 'שרה ישראלי', counsel: 'עו"ד משה לוי' },
    ]);
  });
  it('reads title category, dates, follow-up line', () => {
    expect(c.titleCategory).toBe(CATEGORY.DECISIONS);
    expect(c.givenDateIso).toBe('2026-07-01');
    expect(c.signedDateIso).toBe('2026-07-02');
    expect(c.afterTitle).toBe('לאחר העיון בהודעה, ביה"ד מבהיר כי הדיון יידחה.');
  });
});

describe('analyzeContent - summons', () => {
  const c = analyzeContent(SUMMONS);
  it('detects summons and hearing date', () => {
    expect(c.titleCategory).toBe(CATEGORY.SUMMONS);
    expect(c.hearingDateIso).toBe('2026-07-01');
    expect(c.caseNo).toBe('1111111/12');
  });
});

describe('analyzeContent - degenerate input', () => {
  it('empty text yields empty info', () => {
    const c = analyzeContent('');
    expect(c.titleCategory).toBeNull();
    expect(c.parties).toEqual([]);
    expect(c.signedDateIso).toBe('');
  });
  it('inline party lines (PDF style)', () => {
    const c = analyzeContent('בבית הדין הרבני הגדול\nהמבקש:ישראל ישראלי, נושא ת"ז מס\'000000018\nע"י ב"כ, עוה"ד דן כהן\n-נגד-\nהמשיבה:שרה ישראלי, נושאת ת"ז מס\'000000026\nגריעה מייצוג');
    expect(c.parties.map((p) => [p.role, p.name])).toEqual([['המבקש', 'ישראל ישראלי'], ['המשיבה', 'שרה ישראלי']]);
    expect(c.parties[0].counsel).toBe('עוה"ד דן כהן');
    expect(c.afterParties).toBe('גריעה מייצוג');
  });
});

describe('filingTitle', () => {
  it('picks the request title line (2+ words, near the top)', () => {
    const c = analyzeContent('בבית הדין הרבני הגדול\nהמערער: ישראל ישראלי\nבקשה להחזר ערבות\n1. טענות');
    expect(c.filingTitle).toBe('בקשה להחזר ערבות');
    expect(analyzeContent('בקשה\nטקסט').filingTitle).toBe('');
  });
});

describe('inferFilerRole', () => {
  const parties = [
    { role: 'המערער', name: 'ישראל ישראלי', counsel: 'עו"ד דן כהן' },
    { role: 'המשיבה', name: 'שרה ישראלי', counsel: 'עו"ד משה לוי' },
  ];
  it('counsel of a party', () => expect(inferFilerRole(parties, 'כהן עו"ד דן')).toBe('ב"כ המערער'));
  it('party itself', () => expect(inferFilerRole(parties, 'שרה ישראלי')).toBe('המשיבה'));
  it('unknown / empty', () => {
    expect(inferFilerRole(parties, 'פלוני')).toBe('');
    expect(inferFilerRole(parties, '')).toBe('');
  });
});
