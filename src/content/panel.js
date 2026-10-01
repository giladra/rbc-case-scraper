import { runScrape } from '../run/orchestrator.js';

const CSS = `
:host{all:initial}
.box{position:fixed;top:12px;left:12px;z-index:2147483647;width:420px;max-height:90vh;display:flex;flex-direction:column;background:#fff;color:#1b2430;border:1px solid #9bb0c9;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:14px/1.4 Arial,sans-serif;direction:rtl}
.hd{background:#2d6cc0;color:#fff;padding:8px 12px;font-weight:bold;display:flex;justify-content:space-between;cursor:pointer}
.bd{padding:10px 12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
button{font:inherit;padding:6px 10px;border:1px solid #2d6cc0;background:#eaf2fc;border-radius:5px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
button.pri{background:#2d6cc0;color:#fff}
.row{display:flex;gap:6px;flex-wrap:wrap}
.main{font-weight:bold;margin-top:6px}
.sub{margin-right:18px;display:flex;gap:6px;align-items:baseline}
.sub.empty{opacity:.45}
.badge{font-size:11px;background:#e6e9ee;border-radius:9px;padding:0 6px}
.badge.closed{background:#fde2d4}
.log{font:12px/1.4 Consolas,monospace;background:#f4f6f9;border:1px solid #d5dbe4;border-radius:5px;padding:6px;max-height:140px;overflow:auto;white-space:pre-wrap;direction:rtl}
progress{width:100%}
.hide{display:none}
`;

export function mountPanel({ client, analyze, saveZip, doc = document }) {
  const host = doc.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="box"><div class="hd"><span>סורק מסמכי בתי הדין</span><span id="tg">▾</span></div>
<div class="bd" id="bd"><div class="row"><button id="load" class="pri">טען תיקים (פתוחים וסגורים)</button><button id="scan" disabled>סרוק מסמכים</button></div>
<label class="row"><input type="checkbox" id="ocr" checked> OCR למסמכי PDF סרוקים (איטי יותר, אופליין)</label>
<div id="tree"></div><div class="row"><button id="go" class="pri" disabled>הורד נבחרים</button><button id="stop" disabled>עצור</button></div>
<progress id="pg" value="0" max="1" class="hide"></progress><div class="log" id="log">מוכן. התחברת לאתר? לחץ "טען תיקים".</div></div></div>`;
  doc.body.appendChild(host);
  const $ = (id) => root.getElementById(id);
  const state = { mains: [], selected: new Set(), counts: new Map(), ac: null };

  const log = (m) => { const l = $('log'); l.textContent += '\n' + m; l.scrollTop = l.scrollHeight; };
  const setBusy = (busy) => { for (const id of ['load', 'scan', 'go']) $(id).disabled = busy; $('stop').disabled = !busy; };
  const selectedSubs = () => state.mains.flatMap((m) => m.subCases).filter((s) => state.selected.has(s.fullNo));

  function renderTree() {
    const t = $('tree');
    t.textContent = '';
    for (const m of state.mains) {
      const d = doc.createElement('div');
      d.innerHTML = `<div class="main"><label><input type="checkbox" data-main="${m.mainNo}"> תיק ${m.mainNo}</label> <span class="badge">${m.subCases.length} תיקי משנה</span></div>`;
      const mainBox = d.querySelector('input');
      mainBox.checked = m.subCases.every((s) => state.selected.has(s.fullNo));
      mainBox.onchange = () => { for (const s of m.subCases) mainBox.checked ? state.selected.add(s.fullNo) : state.selected.delete(s.fullNo); renderTree(); updateButtons(); };
      for (const s of m.subCases) {
        const n = state.counts.get(s.fullNo);
        const row = doc.createElement('label');
        row.className = 'sub' + (n === 0 ? ' empty' : '');
        row.innerHTML = `<input type="checkbox"> <span></span> <span class="badge${s.isClosed ? ' closed' : ''}">${s.isClosed ? 'סגור' : 'פתוח'}</span>${n !== undefined ? `<span class="badge">${n} מסמכים</span>` : ''}`;
        row.querySelector('span').textContent = `${s.fullNo} ${s.subject}`;
        const cb = row.querySelector('input');
        cb.checked = state.selected.has(s.fullNo);
        cb.onchange = () => { cb.checked ? state.selected.add(s.fullNo) : state.selected.delete(s.fullNo); updateButtons(); };
        d.appendChild(row);
      }
      t.appendChild(d);
    }
  }
  function updateButtons() {
    const any = selectedSubs().length > 0;
    $('scan').disabled = !any;
    $('go').disabled = !any;
  }

  $('load').onclick = async () => {
    setBusy(true); $('stop').disabled = true;
    try {
      log('טוען את רשימת התיקים (הכל)…');
      state.mains = await client.loadAllCases();
      state.selected = new Set(state.mains.flatMap((m) => m.subCases.map((s) => s.fullNo)));
      state.counts.clear();
      const n = state.mains.reduce((a, m) => a + m.subCases.length, 0);
      log(`נמצאו ${state.mains.length} תיקים ו-${n} תיקי משנה (כולל סגורים).`);
      renderTree();
    } catch (e) { log('שגיאה: ' + e.message); }
    setBusy(false); updateButtons();
  };

  $('scan').onclick = async () => {
    setBusy(true);
    state.ac = new AbortController();
    try {
      const subs = selectedSubs();
      let i = 0;
      for (const s of subs) {
        if (state.ac.signal.aborted) break;
        log(`סורק ${s.fullNo} (${++i}/${subs.length})…`);
        await client.openSubCase(s);
        const page = await client.getDocuments(s);
        state.counts.set(s.fullNo, page.rows.length);
        if (page.total != null && page.total !== page.rows.length) log(`אזהרה: ${s.fullNo} — ${page.rows.length} שורות מתוך ${page.total}`);
        if (page.rows.length === 0) state.selected.delete(s.fullNo);
      }
      renderTree();
      log('הסריקה הסתיימה.');
    } catch (e) { log('שגיאה: ' + e.message); }
    setBusy(false); updateButtons();
  };

  $('go').onclick = async () => {
    setBusy(true);
    state.ac = new AbortController();
    const pg = $('pg'); pg.classList.remove('hide'); pg.value = 0;
    try {
      const subs = selectedSubs();
      await runScrape({
        client, subs, analyze: (a) => analyze({ ...a, ocr: $('ocr').checked }), signal: state.ac.signal,
        emit: (e) => {
          if (e.type === 'sub-start') { log(`תיק ${e.sub.fullNo} (${e.index}/${e.totalSubs})`); pg.max = 1; pg.value = 0; }
          else if (e.type === 'doc') { pg.max = e.total; pg.value = e.done; }
          else if (e.type === 'error') log(`  ✗ ${e.sub.fullNo}: ${e.message}`);
          else if (e.type === 'zip') { saveZip(e.fileName, e.bytes); log(`✓ ${e.fileName} — ${e.docCount} מסמכים`); }
          else if (e.type === 'done') log(`סיום: ${e.summary.docs} מסמכים, ${e.summary.errors.length} שגיאות.`);
        },
      });
    } catch (e) { log('נעצר: ' + e.message); }
    pg.classList.add('hide');
    setBusy(false); updateButtons();
  };

  $('stop').onclick = () => { state.ac?.abort(); log('עוצר…'); };
  root.querySelector('.hd').onclick = () => $('bd').classList.toggle('hide');
  return { root, state };
}
