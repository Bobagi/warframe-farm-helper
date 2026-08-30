'use strict';

/**
 * Contrato (Bounty) de mundo aberto não é "compra num vendedor" nem um nó de
 * missão comum: só se consegue falando com um NPC (ou pegando no quiosque) num
 * hub social e jogando até a rotação certa. As drop tables da DE só trazem a
 * string do LOCAL ("Venus/Orb Vallis (Level 20 - 40 Orb Vallis Bounty),
 * Rotation B") - sem dizer isso, e foi exatamente essa lacuna que motivou este
 * módulo: um item "Melhor fonte" citando Vale dos Orbes não deixava claro que
 * era preciso ir a Fortuna, falar com Eudico e pegar um Contrato.
 *
 * Tabela conferida na wiki oficial em 2026-08-30. NPC null = hub sem NPC
 * nomeado documentado (o contrato sai de um quiosque/painel, ex.: Höllvania).
 */
const BOUNTY_HUBS = [
  { re: /Cetus Bounty|Ghoul Bounty/i, hub: 'Cetus', npc: 'Konzu' },
  { re: /Orb Vallis Bounty/i, hub: 'Fortuna', npc: 'Eudico' },
  { re: /Cambion Drift Bounty/i, hub: 'Necralisk', npc: 'Mother' },
  { re: /Entrati Lab Bounty/i, hub: 'Sanctum Anatomica', npc: 'Fibonacci' },
  { re: /Zariman Bounty/i, hub: 'Chrysalith', npc: 'Quinn' },
  { re: /WF1999 Bounty|Antivirus Bounty/i, hub: 'Höllvania Central Mall', npc: null },
];

/**
 * Dado o LOCAL cru do drop (inglês, ANTES de passar por `placeIn`), acha o
 * hub/NPC do Contrato correspondente, ou `null` quando não é um Contrato ou é
 * de um mundo aberto ainda não catalogado aqui. Rodar sobre o texto cru
 * (inglês) é o que faz o casamento funcionar independente do idioma da
 * página - `placeIn` só troca palavras DEPOIS que este módulo já rodou.
 */
function bountyHubFor(location) {
  const s = String(location == null ? '' : location);
  if (!/Bounty/i.test(s)) return null;
  for (const b of BOUNTY_HUBS) {
    if (b.re.test(s)) return { hub: b.hub, npc: b.npc };
  }
  return null;
}

module.exports = { bountyHubFor };
