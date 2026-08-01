'use strict';

/**
 * "Última vence" para buscas assíncronas concorrentes.
 *
 * O debounce só espaça os disparos; uma vez em voo, respostas de queries antigas
 * podem voltar FORA DE ORDEM e sobrescrever a atual (o bug clássico do
 * autocomplete: você digita/apaga/digita e o dropdown mostra um resultado
 * anterior). Este runner resolve isso com duas garantias:
 *   1) ao iniciar uma nova chamada, ABORTA a anterior ainda em voo (via
 *      AbortController - passa o signal para o fetch, que é cancelado de fato);
 *   2) mesmo que uma resposta antiga escape do abort e volte, ela é marcada como
 *      `superseded` (o número de sequência não é mais o atual) e o chamador a
 *      descarta em vez de renderizar.
 *
 * Módulo UMD: `Latest` no browser (via <script>), `module.exports` no Node
 * (para os testes). Sem dependências.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) root.Latest = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createLatestRunner() {
    let seq = 0;
    let controller = null;

    /**
     * Executa `task(signal)` como a busca mais recente. Retorna
     * `{ superseded: true }` se uma chamada mais nova começou antes desta
     * resolver (resultado obsoleto - descarte); senão `{ superseded: false,
     * value }`. Erros do task (incl. AbortError) propagam para o chamador.
     */
    async function run(task) {
      const mySeq = ++seq;
      if (controller) controller.abort(); // cancela a busca anterior em voo
      controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const signal = controller ? controller.signal : undefined;
      try {
        const value = await task(signal);
        if (mySeq !== seq) return { superseded: true };
        return { superseded: false, value };
      } finally {
        if (mySeq === seq) controller = null; // não anula o controller de uma busca mais nova
      }
    }

    /** Cancela a busca em voo (ex.: input esvaziou) e invalida qualquer resposta pendente. */
    function cancel() {
      seq += 1;
      if (controller) { controller.abort(); controller = null; }
    }

    return { run, cancel };
  }

  return { createLatestRunner };
});
