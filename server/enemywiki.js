'use strict';

/**
 * Link de wiki para fontes de drop que são um INIMIGO/NPC/objeto nomeado
 * ("Tyl Regor", "Kuva Larvling", "Elite Exo Gokstad Crewship (Level 51 - 100)",
 * "Cephalon Simaris", "Orokin Storage Container").
 *
 * As tabelas de drop misturam três formatos numa string só:
 *   - nó de missão .... "Ceres/Lex (Capture), Rotation B"  → tem "/"
 *   - oferta/rotação .. "Steel Meridian, General"          → tem ","
 *   - evento/modo ..... "Duviri/Endless: Tier 1 (Normal)"  → tem ":" (e "/")
 *   - inimigo/NPC ..... "Corrupted Vor"                    → nome puro
 * Só o último grupo ganha link. O alvo é a BUSCA da wiki
 * (index.php?search=...): com título exato a MediaWiki redireciona direto para
 * a página; variantes sem página própria ("Narmer Detron Ranger") caem nos
 * resultados - nunca num 404 (mesma razão do wikiSearchFor de peças prime).
 */

const WIKI_SEARCH = 'https://wiki.warframe.com/index.php?search=';

// sufixo parentético é contexto, não parte do nome: "(Level 51 - 100)",
// "(Capture)", "(Tier 3)", "(Steel Path)", "(Ascension Mode)"...
const PAREN_SUFFIX_RE = /\s*\([^)]*\)\s*$/;

// nomes sem "/", "," e ":" que MESMO ASSIM não são um inimigo/NPC
const NOT_ENEMY_RE = [
  /\bRelic$/i, // tipo novo de relíquia fora do RELIC_RE clássico ("Vanguard C1 Relic")
  /\bRewards?$/i, // baldes de recompensa ("Deep Archimedea Gold Rewards")
  /\bEnem(?:y|ies)$/i, // grupos genéricos ("Eximus Enemy", "... Spaceport Enemies")
  /^Void (?:Storm|Fissure|Surplus)\b/i, // eventos de missão, não um mob
  /^Sorties?$/i,
  /^Duviri\b/i, // modos ("Duviri Circuit", "Duviri Full Experience"...)
  /\bSabotage$/i, // missão de evento ("Fomorian Sabotage")
];

/**
 * URL de wiki para a fonte de drop, ou null quando a string é local de
 * missão/rotação/evento. Recebe o nome CRU em inglês (antes do placePt).
 */
function enemyWikiUrl(location) {
  const raw = String(location == null ? '' : location).trim();
  if (!raw || raw.includes('/') || raw.includes(',') || raw.includes(':')) return null;
  const base = raw.replace(PAREN_SUFFIX_RE, '').trim();
  if (base.length < 3 || base.includes(' - ')) return null;
  for (const rx of NOT_ENEMY_RE) if (rx.test(base)) return null;
  return WIKI_SEARCH + encodeURIComponent(base);
}

module.exports = { enemyWikiUrl };
