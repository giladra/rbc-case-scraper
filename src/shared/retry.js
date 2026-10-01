export async function withRetry(fn, { retries = 2, baseDelayMs = 400, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (e?.fatal || attempt >= retries) throw e;
      await sleep(baseDelayMs * 2 ** attempt);
      attempt++;
    }
  }
}
