import { describe, it, expect } from 'vitest';
import { normalize, sanitizePart, truncate, splitDateCell, dmyToIso } from '../src/shared/text.js';
import { withRetry } from '../src/shared/retry.js';

describe('normalize', () => {
  it('strips bidi marks and niqqud, unifies quotes, collapses spaces', () => {
    expect(normalize('\u200fבית\u00a0 הדין  \u05f4ביה\u05f4ד')).toBe('בית הדין "ביה"ד');
    expect(normalize('שָׁלוֹם')).toBe('שלום');
    expect(normalize(null)).toBe('');
  });
});

describe('sanitizePart', () => {
  it('removes illegal chars and converts quotes to gershayim', () => {
    expect(sanitizePart('עו"ד: דוד/לוי?')).toBe('עו״ד דוד לוי');
  });
  it('guards reserved names and trailing dots', () => {
    expect(sanitizePart('con')).toBe('_con');
    expect(sanitizePart('abc..')).toBe('abc');
  });
});

describe('truncate', () => {
  it('cuts by code points and trims', () => {
    expect(truncate('אבגד הוז', 5)).toBe('אבגד');
    expect(truncate('abc', 10)).toBe('abc');
  });
});

describe('dates', () => {
  it('splits a list date cell', () => {
    expect(splitDateCell('14/06/2026כ"ט סיון תשפ"ו')).toEqual({ display: '14/06/2026', iso: '2026-06-14', hebrew: 'כ"ט סיון תשפ"ו' });
    expect(splitDateCell('  ')).toEqual({ display: '', iso: '', hebrew: '' });
  });
  it('dmyToIso', () => {
    expect(dmyToIso('1.7.26')).toBe('');
    expect(dmyToIso('1/7/26')).toBe('2026-07-01');
    expect(dmyToIso('01/07/2026')).toBe('2026-07-01');
    expect(dmyToIso('x')).toBe('');
  });
});

describe('withRetry', () => {
  const sleep = async () => {};
  it('retries then succeeds', async () => {
    let n = 0;
    const r = await withRetry(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { retries: 2, sleep });
    expect(r).toBe('ok'); expect(n).toBe(3);
  });
  it('gives up after retries', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error('boom'); }, { retries: 1, sleep })).rejects.toThrow('boom');
    expect(n).toBe(2);
  });
  it('does not retry fatal errors', async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw Object.assign(new Error('f'), { fatal: true }); }, { retries: 5, sleep })).rejects.toThrow('f');
    expect(n).toBe(1);
  });
});
