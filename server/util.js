'use strict';

const USER_AGENT = 'warframe-farm-helper/1.0 (+https://warframe.bobagi.space)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

/** Remove acentos ("relíquia" → "reliquia") para busca tolerante PT/EN. */
const stripDiacritics = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/**
 * GET JSON com timeout e retry — usado só contra hosts fixos e confiáveis
 * (WFCD/GitHub, warframestat.us, warframe.market, Google CSE).
 */
async function fetchJson(url, { timeoutMs = 20000, retries = 2, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

module.exports = { fetchJson, sleep, nowSec, stripDiacritics, escapeHtml, USER_AGENT };
