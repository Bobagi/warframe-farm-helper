'use strict';

/**
 * Tradução de strings de local de drop (PT-BR) - planetas, regiões abertas,
 * tipos de missão e termos ("Rotation"→"Rotação"), mantendo os nomes próprios
 * dos nós/bosses. Ex.: "Venus/Orb Vallis (Level 40 - 60 Bounty), Rotation C" →
 * "Vênus/Vale dos Orbes (Nível 40 - 60 Contrato), Rotação C".
 *
 * UMD: `Places` no browser (fissuras) e `module.exports` no Node (steps/sources
 * do /api/item, traduzidos no servidor). Sem dependências.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.Places = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // ordem IMPORTA: frases multi-palavra antes das de uma palavra, senão a curta
  // traduz primeiro e a longa não casa mais (ex.: "Mobile Defense" antes de "Defense").
  const TERMS = [
    // regiões abertas / compostas
    ['Orb Vallis', 'Vale dos Orbes', '奥布山谷'], ['Plains of Eidolon', 'Planícies de Eidolon', '夜灵平野'],
    ['Cambion Drift', 'Deriva Cambion', '魔胎之境'], ['Veil Proxima', 'Véu Proxima', '帷幕星区'],
    ['Kuva Fortress', 'Fortaleza Kuva', '赤毒要塞'], ['Sanctuary Onslaught', 'Assalto ao Santuário', '圣殿突袭'],
    // tipos de missão compostos
    ['Mobile Defense', 'Defesa Móvel', '移动防御'], ['Ghoul Bounty', 'Contrato Ghoul', '食尸鬼赏金'],
    ['Void Cascade', 'Cascata do Void', '虚空级联'], ['Void Flood', 'Inundação do Void', '虚空洪流'],
    ['Infested Salvage', 'Recuperação Infestada', '感染残骸'], ['Free Roam', 'Mundo Aberto', '自由漫游'],
    ['Legacyte Harvest', 'Colheita de Legacyte', '古卫质采集'], ['Isolation Vault', 'Cofre de Isolamento', '隔离仓库'],
    // planetas
    ['Earth', 'Terra', '地球'], ['Venus', 'Vênus', '金星'], ['Mercury', 'Mercúrio', '水星'], ['Mars', 'Marte', '火星'],
    ['Jupiter', 'Júpiter', '木星'], ['Saturn', 'Saturno', '土星'], ['Uranus', 'Urano', '天王星'], ['Neptune', 'Netuno', '海王星'],
    ['Pluto', 'Plutão', '冥王星'], ['Void', 'Void', '虚空'], ['Phobos', 'Phobos', '火卫一'],
    ['Ceres', 'Ceres', '谷神星'], ['Eris', 'Eris', '阋神星'], ['Sedna', 'Sedna', '赛德娜'],
    ['Europa', 'Europa', '木卫二'], ['Deimos', 'Deimos', '火卫二'], ['Lua', 'Lua', '月球'],
    ['Zariman', 'Zariman', '扎里曼'], ['Duviri', 'Duviri', '德维里'], ['Cetus', 'Cetus', '希图斯'],
    ['Fortuna', 'Fortuna', '福尔图娜'], ['Necralisk', 'Necralisk', '殁世玄坛'],
    // relays e locais que aparecem nos painéis do Baro e da Varzia
    ["Maroo's Bazaar", 'Bazar da Maroo', '玛珑集市'], ['Relay', 'Relay', '中继站'],
    ['Strata', 'Strata', '斯特拉塔'], ['Kronia', 'Kronia', '克洛尼亚'],
    ['Larunda', 'Larunda', '拉伦达'], ['Vesper', 'Vesper', '维斯珀'],
    ['Orcus', 'Orcus', '奥库斯'], ['Cetus', 'Cetus', '希图斯'],
    // tipos de missão de uma palavra
    ['Interception', 'Interceptação', '拦截'], ['Disruption', 'Disrupção', '中断'], ['Survival', 'Sobrevivência', '生存'],
    ['Extermination', 'Extermínio', '歼灭'], ['Exterminate', 'Extermínio', '歼灭'], ['Capture', 'Captura', '捕获'],
    ['Defense', 'Defesa', '防御'], ['Spy', 'Espionagem', '间谍'], ['Sabotage', 'Sabotagem', '破坏'], ['Rescue', 'Resgate', '救援'],
    ['Excavation', 'Escavação', '挖掘'], ['Assassination', 'Assassinato', '刺杀'], ['Hijack', 'Sequestro de Carga', '劫持'],
    ['Defection', 'Deserção', '叛逃'], ['Arena', 'Arena', '竞技场'], ['Alchemy', 'Alquimia', '炼金'], ['Skirmish', 'Escaramuça', '遭遇战'],
    ['Volatile', 'Volátil', '不稳定'], ['Assault', 'Assalto', '突袭'], ['Bounty', 'Contrato', '赏金'],
    // termos avulsos
    ['Caches', 'Baús', '密藏'], ['Cache', 'Baú', '密藏'], ['Rotation', 'Rotação', '轮换'], ['Level', 'Nível', '等级'],
    ['Rewards', 'Recompensas', '奖励'], ['Boss', 'Boss', '首领'],
  ];

  const RX = TERMS.map(([en, pt, zh]) => [
    new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), pt, zh || null,
  ]);

  /**
   * Traduz uma string de local de drop para o idioma pedido.
   *
   * Só planeta, região aberta, tipo de missão e termo entram na tabela. NOME DE
   * NÓ fica como está de propósito (Adaro, Akkad, Abaddon): são nomes próprios
   * mitológicos, e o cliente chinês também os mantém em latim - só os nós
   * DESCRITIVOS ganharam nome em CN (Cambion Drift → 魔胎之境), e esses estão
   * na tabela. Conferido contra o i18n do WFCD e o warframe.market zh-hans.
   */
  function placeIn(s, lang) {
    // Índice EXPLÍCITO por idioma. Um `lang === 'zh' ? 2 : 1` devolveria
    // PORTUGUÊS para 'en'/'es'/'ru', que é pior do que não traduzir: o local
    // sairia em português no meio de uma página em inglês.
    const COL = { pt: 1, zh: 2 };
    const idx = COL[lang];
    if (!idx) return String(s == null ? '' : s);
    let out = String(s == null ? '' : s);
    for (const t of RX) {
      const alvo = t[idx];
      if (alvo) out = out.replace(t[0], alvo);
    }
    return out;
  }

  /**
   * Tier de relíquia por idioma. O cliente chinês tem nome OFICIAL para os
   * tiers (conferido no i18n do WFCD: "Lith A1" → "古纪 A1 遗物"), e sem isto
   * a tabela de relíquias de uma página em chinês fica inteira em latim.
   * O CÓDIGO da relíquia ("A1", "V9") e a URL/slug não mudam.
   */
  const RELIC_TIER = {
    zh: { Lith: '古纪', Meso: '前纪', Neo: '中纪', Axi: '后纪', Requiem: '安魂', Vanguard: '先锋' },
  };
  function relicNameIn(name, lang) {
    const s2 = String(name == null ? '' : name);
    const map = RELIC_TIER[lang];
    if (!map) return s2;
    const m = s2.match(/^(\S+)(\s[\s\S]*)?$/);
    const tier = m && map[m[1]];
    return tier ? tier + (m[2] || '') : s2;
  }

  const placePt = (s) => placeIn(s, 'pt');
  const placeZh = (s) => placeIn(s, 'zh');

  return { placePt, placeZh, placeIn, relicNameIn, RELIC_TIER };
});
