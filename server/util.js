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
 * GET JSON com timeout e retry - usado só contra hosts fixos e confiáveis
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

/**
 * Remove o token de ÍCONE do jogo que o dataset deixa dentro do nome:
 * `<ARCHWING> Itzal`, `<Shard_blue_simple> Azure Archon Shard`,
 * `File-A-Style<Retro_tm> Binder`. No jogo isso vira um glifo; em texto puro
 * vaza para o `<h1>`, para o `<title>` e para a busca.
 *
 * O padrão é estreito de propósito (`<` + letras/dígitos/_ + `>`, sem espaço):
 * assim não morde um nome legítimo que tenha `<` no meio.
 */
const ICON_TOKEN_RE = /<[A-Za-z0-9_]+>/g;
function cleanName(name) {
  if (typeof name !== 'string') return name;
  const out = name.replace(ICON_TOKEN_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  return out || name; // nome que era SÓ token: melhor o original que vazio
}

/**
 * Recursos de crafting comuns que o WFCD lista como componente mas NÃO tem
 * como item próprio no Resources.json (ficam em Misc). Tratados como
 * ingredientes: não ganham prefixo do item nem viram doc de componente.
 */
const COMMON_RESOURCES = new Set([
  'Ferrite', 'Nano Spores', 'Salvage', 'Alloy Plate', 'Circuits', 'Rubedo',
  'Plastids', 'Polymer Bundle', 'Cryotic', 'Oxium', 'Gallium', 'Morphics',
  'Neurodes', 'Neural Sensors', 'Orokin Cell', 'Control Module', 'Argon Crystal',
  'Tellurium', 'Kuva', 'Forma', 'Detonite Injector', 'Fieldron', 'Mutagen Mass',
  'Detonite Ampule', 'Fieldron Sample', 'Mutagen Sample', 'Nitain Extract',
  'Hexenon', 'Nano Spores', 'Ferrite',
]);

/**
 * Categoria do WFCD → "kind" usado na busca e na deduplicação de itens de
 * mesmo nome (o dataset repete o MESMO item com uniqueNames diferentes).
 * Compartilhado entre search.js (dedup do índice) e seo.js (canonical/sitemap)
 * para os dois elegerem o MESMO vencedor.
 */
const CATEGORY_KIND = {
  Mods: 'mod', Resources: 'resource', Fish: 'fish',
  Gear: 'gear', Quests: 'quest', Arcanes: 'arcane',
};

module.exports = {
  fetchJson, sleep, nowSec, stripDiacritics, escapeHtml, USER_AGENT, cleanName,
  COMMON_RESOURCES, CATEGORY_KIND,
};
