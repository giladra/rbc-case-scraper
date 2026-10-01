import { withRetry } from '../shared/retry.js';
import { buildFileName, folderFor, uniquePath } from '../output/naming.js';
import { buildIndexRow, buildFailureRow, toCsv, toJson } from '../output/index-writer.js';
import { buildZip } from '../output/zip.js';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runScrape({ client, subs, analyze, emit = () => {}, signal, concurrency = 3, pauseMs = 100, retries = 2, sleep = realSleep }) {
  const byMain = new Map();
  for (const s of subs) {
    if (!byMain.has(s.mainNo)) byMain.set(s.mainNo, []);
    byMain.get(s.mainNo).push(s);
  }
  const summary = { zips: [], errors: [], docs: 0 };
  let fatal = null;
  let subIndex = 0;

  for (const [mainNo, list] of byMain) {
    const entries = [];
    const indexRows = [];
    const taken = new Set();

    for (const sub of list) {
      if (signal?.aborted || fatal) break;
      emit({ type: 'sub-start', sub, index: ++subIndex, totalSubs: subs.length });
      let page;
      try {
        page = await withRetry(async () => { await client.openSubCase(sub); return client.getDocuments(sub); }, { retries, sleep });
      } catch (e) {
        summary.errors.push({ sub: sub.fullNo, message: e.message });
        emit({ type: 'error', sub, message: e.message });
        if (e.fatal) fatal = e;
        continue;
      }

      const queue = [...page.rows];
      let done = 0;
      const worker = async () => {
        while (queue.length && !signal?.aborted && !fatal) {
          const row = queue.shift();
          try {
            const file = await withRetry(() => client.downloadDocument(page, row), { retries, sleep });
            const meta = await analyze({ row, sub, bytes: file.bytes, serverName: file.serverName });
            const path = uniquePath(`${folderFor(sub, meta.category)}/${buildFileName(meta)}`, taken, meta.docId);
            entries.push({ path, bytes: file.bytes });
            indexRows.push(buildIndexRow(sub, path, meta));
            summary.docs++;
          } catch (e) {
            summary.errors.push({ sub: sub.fullNo, message: e.message });
            indexRows.push(buildFailureRow(sub, row, e.message));
            emit({ type: 'error', sub, message: e.message });
            if (e.fatal) fatal = e;
          }
          done++;
          emit({ type: 'doc', sub, done, total: page.rows.length });
          if (pauseMs) await sleep(pauseMs);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, page.rows.length) }, worker));
    }

    if (entries.length || indexRows.length) {
      const enc = new TextEncoder();
      const bytes = buildZip([
        ...entries,
        { path: `${mainNo}/index.csv`, bytes: enc.encode(toCsv(indexRows)) },
        { path: `${mainNo}/index.json`, bytes: enc.encode(toJson(indexRows)) },
      ]);
      const z = { mainNo, fileName: `${mainNo}.zip`, docCount: entries.length };
      summary.zips.push(z);
      emit({ type: 'zip', ...z, bytes });
    }
    if (signal?.aborted || fatal) break;
  }

  emit({ type: 'done', summary });
  if (fatal) throw fatal;
  return summary;
}
