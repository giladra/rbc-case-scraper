import { describe, it, expect } from 'vitest';
import { expandRowParam, parseCallbackHtml } from '../src/site/dx-callback.js';

describe('expandRowParam', () => {
  it('matches the format captured from the live site', () => {
    expect(expandRowParam(0)).toBe('c0:GB|21;9|EXPANDROW1|05|false;');
    expect(expandRowParam(1)).toBe('c0:GB|21;9|EXPANDROW1|15|false;');
  });
  it('multi-digit indexes follow the same length-prefixed scheme (only single digits were verified live)', () => {
    expect(expandRowParam(12)).toBe('c0:GB|22;9|EXPANDROW2|125|false;');
  });
});

describe('parseCallbackHtml', () => {
  it('extracts and unescapes the JS string result', () => {
    const text = "0|/*DX*/({'id':0,'result':'<tr id=\\\"a\\\">\\r\\n\\t<td>It\\'s \\u05d0\\u05d1 \\x41<\\/td><\\/tr>','stateObject':{'x':1}})";
    expect(parseCallbackHtml(text)).toBe('<tr id="a">\r\n\t<td>It\'s אב A</td></tr>');
  });
  it('throws a clear error when the shape is unexpected', () => {
    expect(() => parseCallbackHtml('<html>login</html>')).toThrow();
    expect(() => parseCallbackHtml("({'result':'unterminated")).toThrow();
  });
});
