export const findForm = (doc) => doc.querySelector('form[name="aspnetForm"]');

export function serializeForm(form) {
  const params = new URLSearchParams();
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const name = el.getAttribute('name');
    if (!name || el.hasAttribute('disabled')) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !el.hasAttribute('checked')) continue;
      params.append(name, el.getAttribute('value') ?? '');
    } else if (tag === 'select') {
      const opts = [...el.querySelectorAll('option')];
      const sel = opts.find((o) => o.hasAttribute('selected')) ?? opts[0];
      if (sel) params.append(name, sel.getAttribute('value') ?? sel.textContent);
    } else {
      params.append(name, el.textContent ?? '');
    }
  }
  return params;
}
