'use strict';

/**
 * Requisitos e recompensas de quest, extraídos do `{{QuestInfobox}}` da wiki
 * oficial (wiki.warframe.com, MediaWiki API). O template é consistente entre
 * quests e traz os campos que o dataset da DE não tem: `requirement`, `reward`,
 * `type`, `previousquest`, `nextquest`. Buscado on-demand e cacheado no SQLite
 * por 30 dias (dado de quest praticamente não muda).
 */

const { fetchJson, nowSec } = require('./util');

const TTL_SEC = 30 * 24 * 3600;
const API = 'https://wiki.warframe.com/api.php';

/** Isola o bloco {{QuestInfobox … }} respeitando templates aninhados ({{WF|X}}). */
function extractInfobox(wt) {
  const start = wt.indexOf('{{QuestInfobox');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < wt.length - 1; i++) {
    if (wt[i] === '{' && wt[i + 1] === '{') { depth++; i++; }
    else if (wt[i] === '}' && wt[i + 1] === '}') { depth--; i++; if (depth === 0) return wt.slice(start, i + 1); }
  }
  return null;
}

/** Limpa wikitext de um valor num array de linhas legíveis (sem links/templates). */
function cleanLines(s) {
  return String(s)
    // {{WF|Jade}}, {{Weapon|Orvius}}, {{M|Mod}}… → o rótulo (2º arg ou 1º)
    .replace(/\{\{(?:WF|Weapon|W|M|Mod|Item|Icon|C|CI|DropLocation)\|([^{}|]+?)(?:\|[^{}]*)?\}\}/gi, '$1')
    .replace(/\{\{ver\|[^{}]*\}\}/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')          // qualquer template restante
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1') // [[Alvo|Texto]] → Texto
    .replace(/\[\[([^\]]+)\]\]/g, '$1')      // [[Alvo]] → Alvo
    .replace(/'''?/g, '')                     // negrito/itálico
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')                   // outras tags
    .split('\n').map((x) => x.replace(/^[*#:]+\s*/, '').trim()).filter(Boolean);
}

/** Parseia o QuestInfobox → { type, requirement[], reward[], previousQuest, nextQuest }. */
function parseQuestInfobox(wikitext) {
  const box = extractInfobox(String(wikitext || ''));
  if (!box) return null;
  const body = box.replace(/^\{\{QuestInfobox/, '').replace(/\}\}$/, '');
  const params = {};
  // cada parâmetro: |chave = valor (valor vai até o próximo "\n|chave =" ou o fim).
  // Só espaços/tabs em volta da estrutura (NÃO \s, que comeria o \n separador e
  // faria um parâmetro VAZIO engolir o próximo).
  const re = /\n[ \t]*\|[ \t]*([a-zA-Z]+)[ \t]*=[ \t]*([\s\S]*?)(?=\n[ \t]*\|[ \t]*[a-zA-Z]+[ \t]*=|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) params[m[1].toLowerCase()] = m[2];

  const firstLine = (v) => { const l = cleanLines(v); return l.length ? l[0] : null; };
  const info = {
    type: params.type ? firstLine(params.type) : null,
    requirement: params.requirement ? cleanLines(params.requirement) : [],
    reward: params.reward ? cleanLines(params.reward).filter((r) => !/^\(.*\)$/.test(r)) : [],
    previousQuest: params.previousquest ? firstLine(params.previousquest) : null,
    nextQuest: params.nextquest ? firstLine(params.nextquest) : null,
  };
  // nada de útil → trata como ausente (o front cai no fallback de wiki-link)
  if (!info.requirement.length && !info.reward.length && !info.previousQuest && !info.nextQuest) return null;
  return info;
}

async function fetchQuestInfoFromWiki(name) {
  const page = String(name).trim().replace(/\s+/g, '_');
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&format=json&prop=wikitext&formatversion=2&redirects=1`;
  const data = await fetchJson(url, { timeoutMs: 12000, retries: 1 });
  const wt = data && data.parse && data.parse.wikitext;
  return wt ? parseQuestInfobox(wt) : null;
}

/**
 * Info de quest com cache no banco. Retorna null se a wiki não tiver o infobox
 * (o chamador mostra o fallback de link). Erros de rede não quebram a página.
 */
async function getQuestInfo(db, uniqueName, name) {
  const row = db.prepare('SELECT data, fetched_at FROM quest_info WHERE unique_name = ?').get(uniqueName);
  if (row && nowSec() - row.fetched_at < TTL_SEC) {
    try { return JSON.parse(row.data); } catch { /* re-busca */ }
  }
  let info = null;
  try { info = await fetchQuestInfoFromWiki(name); } catch { info = null; }
  if (info) {
    db.prepare('INSERT OR REPLACE INTO quest_info(unique_name, data, fetched_at) VALUES (?, ?, ?)')
      .run(uniqueName, JSON.stringify(info), nowSec());
    return info;
  }
  if (row) { try { return JSON.parse(row.data); } catch { /* nada */ } } // velho é melhor que nada
  return null;
}

module.exports = { getQuestInfo, parseQuestInfobox, extractInfobox, cleanLines };
