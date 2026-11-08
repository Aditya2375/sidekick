'use strict';

// Small fetch wrapper: timeout, retry with backoff on 429/5xx, no redirects
// to odd places, no logging of bodies (they can contain prompts/keys).
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson({ url, headers, body, timeoutMs, fetchImpl, retries = 2 }) {
  const doFetch = fetchImpl || fetch;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal
      });
      if (res.ok) {
        return await res.json();
      }
      const status = res.status;
      const text = await res.text().catch(() => '');
      lastError = new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
      lastError.status = status;
      if (!RETRYABLE.has(status) || attempt === retries) throw lastError;
    } catch (err) {
      lastError = err;
      const retryableStatus = err.status && RETRYABLE.has(err.status);
      const transient = err.name === 'AbortError' || err.name === 'TypeError';
      if ((!retryableStatus && !transient) || attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
    await sleep(500 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
  }
  throw lastError;
}

async function postForm({ url, headers, formData, timeoutMs, fetchImpl, retries = 1 }) {
  const doFetch = fetchImpl || fetch;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal
      });
      if (res.ok) return await res.json();
      const status = res.status;
      const text = await res.text().catch(() => '');
      lastError = new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
      lastError.status = status;
      if (!RETRYABLE.has(status) || attempt === retries) throw lastError;
    } catch (err) {
      lastError = err;
      const retryableStatus = err.status && RETRYABLE.has(err.status);
      const transient = err.name === 'AbortError' || err.name === 'TypeError';
      if ((!retryableStatus && !transient) || attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
    await sleep(700 * Math.pow(2, attempt));
  }
  throw lastError;
}

module.exports = { postJson, postForm, RETRYABLE };
