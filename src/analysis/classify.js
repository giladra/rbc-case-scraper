export const CATEGORY = Object.freeze({
  DECISIONS: 'החלטות',
  SUMMONS: 'הזמנות לדיון',
  FILINGS: 'בקשות וכתבי טענות',
  PROTOCOLS: 'פרוטוקולים',
  ADMIN: 'פעולות מנהליות',
  ATTACHMENTS: 'נספחים',
  UNCLASSIFIED: 'לא מסווג',
});

const W = (...ws) => new RegExp(`^(?:${ws.join('|')})(?=\\s|$|[-,:;])`);
const HEAD_RULES = [
  [CATEGORY.DECISIONS, W('החלטה', 'החלטת', 'פסק דין', 'פסק-דין', 'צו')],
  [CATEGORY.SUMMONS, W('הזמנה', 'זימון')],
  [CATEGORY.PROTOCOLS, W('פרוטוקול', 'תמליל')],
  [CATEGORY.ATTACHMENTS, W('נספח', 'נספחים')],
  [CATEGORY.FILINGS, W('בקשה', 'בקשת', 'תגובה', 'תשובה', 'כתב', 'ערעור', 'בר"ע', 'סיכומים', 'סיכום', 'תצהיר', 'עתירה', 'הודעה', 'הודעת', 'השלמת', 'השלמה', 'ערר', 'טיעונים')],
  [CATEGORY.ADMIN, W('יפוי כ(?:ו)?ח', 'ייפוי כ(?:ו)?ח', 'מינוי', 'גריעה', 'קבלה', 'אישור', 'אסמכתא', 'מסירה', 'אגרה', 'הצהרה', 'טופס', 'הנחיות')],
];

function fromHead(head) {
  for (const [cat, re] of HEAD_RULES) if (re.test(head)) return cat;
  return null;
}

export function classify({ typeInfo, content, hasTextLayer }) {
  const flags = [];
  const metaCat = fromHead(typeInfo.head);
  const bodyCat = content?.titleCategory ?? null;
  if (!hasTextLayer) flags.push('needs-ocr');
  if (metaCat === CATEGORY.ATTACHMENTS) return { category: metaCat, confidence: 'medium', flags };
  if (metaCat && bodyCat) {
    if (metaCat !== bodyCat) {
      flags.push('type-mismatch');
      return { category: metaCat, confidence: 'medium', flags };
    }
    return { category: metaCat, confidence: 'high', flags };
  }
  if (metaCat) return { category: metaCat, confidence: 'medium', flags };
  if (bodyCat) return { category: bodyCat, confidence: 'low', flags: [...flags, 'classified-from-content'] };
  return { category: CATEGORY.UNCLASSIFIED, confidence: 'low', flags: [...flags, 'unclassified'] };
}
