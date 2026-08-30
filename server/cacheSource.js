'use strict';

/**
 * Missão de Extermínio/Sabotagem/Escavação com "(Caches)" espalha VÁRIOS
 * baús pelo mapa - cada um é um sorteio independente - numa partida de
 * poucos minutos. Isso muda a farm real: uma % de 12-15% por baú, com 4-8
 * baús por partida curta, costuma render mais recurso/hora que um Contrato
 * de 25% com um único sorteio por rotação numa partida de ~15-20 min.
 *
 * Precisa rodar sobre o LOCAL CRU (inglês, antes de `placeIn`): a tradução
 * PT troca "Caches" por "Baús", então testar depois da tradução nunca casa.
 * Mesma razão de `bountyHubFor` rodar cedo, em `server/bountyHubs.js`.
 */
function isCacheSource(location) {
  return /Caches\b/i.test(String(location == null ? '' : location));
}

module.exports = { isCacheSource };
