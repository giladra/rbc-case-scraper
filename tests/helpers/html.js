import { parseHTML } from 'linkedom';

export const parse = (html) => parseHTML(html).document;

export const COMBO = 'ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel1$cmbFileState';
export const COMBO_VI = 'ctl00_ctl00_ContentPlaceHolder_PH_GridData_ASPxRoundPanel1_cmbFileState_VI';
export const FIND_BTN = 'ctl00$ctl00$ContentPlaceHolder$PH_GridData$ASPxRoundPanel1$btnFindUserFiles';

export function listRows(subs, offset = 0) {
  return subs.map((s, i) => `<tr id="ctl00_x_grdFilesView_DXDataRow${i + offset}"><td>&nbsp;</td>` +
    `<td><a href="javascript:void(0)" onclick="openFileDetails(&quot;${s.t3}&quot;,&quot;${s.t4}&quot;);">${s.name}</a></td>` +
    `<td>${s.opened ?? '01/01/2020'}<br>א' טבת</td><td>${s.court ?? 'ירושלים'}</td><td>&nbsp;</td>` +
    `<td>${s.closed ? s.closed + "<br>ב' שבט" : '&nbsp;'}</td><td>&nbsp;</td><td>${s.last ?? 'מסמך מתאריך 01/01/2021'}</td></tr>`).join('');
}

export const mainOf = (s) => s.name.split('/')[0];
export const groupRowHtml = (main, i, expanded) =>
  `<tr id="ctl00_x_grdFilesView_DXGroupRow${expanded ? 'Exp' : ''}${i}"><td></td><td colspan="7">: ${main} , אישות , שרה ישראלי</td></tr>`;

// collapsed=true mimics the real server: only group rows, no data rows until a group is expanded by callback.
export function listPage({ filterText = 'פתוחים', filterValue = '1', subs = [], collapsed = false } = {}) {
  const mains = [...new Set(subs.map(mainOf))].sort();
  const body = collapsed
    ? mains.map((m, i) => groupRowHtml(m, i, false)).join('')
    : mains.map((m, i) => groupRowHtml(m, i, true) + listRows(subs.filter((s) => mainOf(s) === m))).join('');
  return `<html><body><form name="aspnetForm" id="aspnetForm" method="post" action="./FilesList.aspx">
<input type="hidden" name="__VIEWSTATE" value="VS"/><input type="hidden" name="__EVENTVALIDATION" value="EV"/>
<input type="text" name="${COMBO}" value="${filterText}"/><input type="hidden" name="${COMBO_VI}" value="${filterValue}"/>
<input type="submit" name="${FIND_BTN}" value=""/><input type="hidden" name="FileID" value=""/><input type="hidden" name="hash" value=""/>
<table>${body}</table></form></body></html>`;
}

// Escapes an HTML fragment into the DevExpress callback reply shape.
export function dxCallbackText(html) {
  const esc = html
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\//g, '\\/')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `0|/*DX*/({'id':0,'result':'${esc}','stateObject':{}})`;
}

export function docsPage({ header = 'מסמכים עבור תיק - 1111111/4, חלוקת רכוש', total, rows = [] } = {}) {
  const trs = rows.map((r, i) => `<tr id="ctl00_x_grdDocumentsView_DXDataRow${i}"><td>${r.type}</td><td>${r.submitter ?? ''}</td>` +
    `<td>${r.date ?? '14/06/2026'}<br>כ"ט סיון תשפ"ו</td><td>${r.origin ?? 'מערכת שיר"ה'}</td>` +
    `<td><a href="javascript:void(0)" onclick="openDocViewer(&quot;${r.tok}&quot;,${r.hash});"></a></td></tr>`).join('');
  return `<html><body><form name="aspnetForm" method="post" action="FileDocuments.aspx">
<input type="hidden" name="__VIEWSTATE" value="VS2"/><input type="hidden" name="DocumentNumber" value=""/><input type="hidden" name="DocumentNumberhash" value=""/>
<input type="checkbox" name="chk1" value="on"/><input type="checkbox" name="chk2" value="on" checked/>
<select name="sel"><option value="a">A</option><option value="b" selected>B</option></select><textarea name="ta">hi</textarea>
<input type="text" name="dis" value="x" disabled/>
<span>${header}</span><table>${trs}</table><div>סה"כ ${total ?? rows.length} פריטים ברשימה</div></form></body></html>`;
}
