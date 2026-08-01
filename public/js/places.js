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
    ['Orb Vallis', 'Vale dos Orbes'], ['Plains of Eidolon', 'Planícies de Eidolon'],
    ['Cambion Drift', 'Deriva Cambion'], ['Veil Proxima', 'Véu Proxima'],
    ['Kuva Fortress', 'Fortaleza Kuva'], ['Sanctuary Onslaught', 'Assalto ao Santuário'],
    // tipos de missão compostos
    ['Mobile Defense', 'Defesa Móvel'], ['Ghoul Bounty', 'Contrato Ghoul'],
    ['Void Cascade', 'Cascata do Void'], ['Void Flood', 'Inundação do Void'],
    ['Infested Salvage', 'Recuperação Infestada'], ['Free Roam', 'Mundo Aberto'],
    ['Legacyte Harvest', 'Colheita de Legacyte'], ['Isolation Vault', 'Cofre de Isolamento'],
    // planetas
    ['Earth', 'Terra'], ['Venus', 'Vênus'], ['Mercury', 'Mercúrio'], ['Mars', 'Marte'],
    ['Jupiter', 'Júpiter'], ['Saturn', 'Saturno'], ['Uranus', 'Urano'], ['Neptune', 'Netuno'],
    ['Pluto', 'Plutão'], ['Void', 'Void'], ['Phobos', 'Phobos'],
    // tipos de missão de uma palavra
    ['Interception', 'Interceptação'], ['Disruption', 'Disrupção'], ['Survival', 'Sobrevivência'],
    ['Extermination', 'Extermínio'], ['Exterminate', 'Extermínio'], ['Capture', 'Captura'],
    ['Defense', 'Defesa'], ['Spy', 'Espionagem'], ['Sabotage', 'Sabotagem'], ['Rescue', 'Resgate'],
    ['Excavation', 'Escavação'], ['Assassination', 'Assassinato'], ['Hijack', 'Sequestro de Carga'],
    ['Defection', 'Deserção'], ['Arena', 'Arena'], ['Alchemy', 'Alquimia'], ['Skirmish', 'Escaramuça'],
    ['Volatile', 'Volátil'], ['Assault', 'Assalto'], ['Bounty', 'Contrato'],
    // termos avulsos
    ['Caches', 'Baús'], ['Cache', 'Baú'], ['Rotation', 'Rotação'], ['Level', 'Nível'],
  ];

  const RX = TERMS.map(([en, pt]) => [new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), pt]);

  /** Traduz uma string de local para PT (idempotente o suficiente p/ uso simples). */
  function placePt(s) {
    let out = String(s == null ? '' : s);
    for (const [rx, pt] of RX) out = out.replace(rx, pt);
    return out;
  }

  return { placePt };
});
