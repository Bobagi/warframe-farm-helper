'use strict';

/**
 * Faixa de relógios dos ciclos dos mundos (Cetus dia/noite, Vallis
 * quente/frio, Deimos Fass/Vome, Duviri, Zariman, Terra) — como no topo do
 * hub.warframestat.us. Inserida logo abaixo do cabeçalho em todas as páginas.
 *
 * A contagem regressiva roda localmente a cada segundo; quando um ciclo vira,
 * re-busca /api/cycles (o servidor avança o estado pela tabela de durações
 * mesmo com o cache velho, então a resposta já vem virada). Re-sync periódico
 * e ao voltar para a aba.
 */

(() => {
  const { el, api } = App;
  const { t } = I18n;

  const header = document.getElementById('site-header');
  if (!header) return;

  // A Terra NÃO é um chip próprio: desde o U38.5 ela é o mesmo ciclo do Cetus, e
  // o servidor a devolve dentro de `cetus.worlds` (['cetus','earth']) → um chip
  // só, "Cetus / Terra". Ordem de exibição dos 5 relógios distintos.
  const ORDER = ['cetus', 'vallis', 'cambion', 'duviri', 'zariman'];

  // Glifos inline (constantes estáticas — innerHTML aqui nunca vê dado externo).
  const SVG = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra}${d ? `<path d="${d}"/>` : ''}</svg>`;
  const GLYPHS = {
    day: SVG('M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8', '<circle cx="12" cy="12" r="4.2"/>'),
    night: SVG('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
    warm: SVG('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'),
    cold: SVG('M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9'),
    fass: SVG('M3 20c3.2-.8 5.6-2.6 7.4-5.5', '<circle cx="14.5" cy="9.5" r="4"/>'),
    vome: SVG('M3 20c3.2-.8 5.6-2.6 7.4-5.5', '<circle cx="14.5" cy="9.5" r="4"/>'),
    grineer: SVG('M12 3l7 3.5V13c0 4-3 6.6-7 8-4-1.4-7-4-7-8V6.5z'),
    corpus: SVG('M4 6h16v9h-5.5L12 18.5 9.5 15H4z'),
    mood: SVG('M12 12a1.6 1.6 0 0 0 3.2 0 4.2 4.2 0 0 0-8.4 0 6.8 6.8 0 0 0 13.6 0 9.4 9.4 0 0 0-18.8 0'),
  };
  // `state` vem da API: usado SÓ como chave própria de GLYPHS (nunca entra no
  // markup) — hasOwnProperty barra chaves herdadas tipo "constructor"
  const glyphFor = (state) => (Object.prototype.hasOwnProperty.call(GLYPHS, state)
    ? GLYPHS[state]
    : (['joy', 'anger', 'envy', 'sorrow', 'fear'].includes(state) ? GLYPHS.mood : GLYPHS.night));

  // estrutura fixa logo abaixo do header (skeleton estável — sem pulo de layout)
  const inner = el('div', { class: 'cyc-inner', role: 'list' });
  const strip = el('div', { class: 'cycle-strip', 'aria-label': t('cyc.aria') }, [inner]);
  header.insertAdjacentElement('afterend', strip);

  let cycles = null; // null = ainda carregando; [] = falhou sem dado
  let lastLoad = 0;
  let loading = false;

  const stateLabel = (s) => {
    const key = `cyc.s.${s}`;
    const label = t(key);
    return label === key ? s : label; // estado desconhecido: mostra cru
  };

  // Segundos só aparecem perto da virada (<10 min), quando importam — mantém os
  // relógios curtos e a faixa numa linha só no desktop (rola no mobile).
  function fmtLeft(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m >= 10) return `${m}m`;
    if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
    return `${s}s`;
  }

  function nextState(c) {
    // só para o rótulo "vira X em..." — a ordem real vive no servidor
    const ORDERS = {
      cetus: ['day', 'night'], vallis: ['warm', 'cold'],
      cambion: ['fass', 'vome'], zariman: ['grineer', 'corpus'],
      duviri: ['joy', 'anger', 'envy', 'sorrow', 'fear'],
    };
    const order = ORDERS[c.id];
    if (!order) return null;
    const i = order.indexOf(c.state);
    return i < 0 ? null : order[(i + 1) % order.length];
  }

  // Nome do relógio: junta os mundos que ele representa ("Cetus / Terra" quando
  // o ciclo cobre mais de um). Fallback para o próprio id se `worlds` faltar.
  const worldLabel = (c) => (Array.isArray(c.worlds) && c.worlds.length ? c.worlds : [c.id])
    .map((w) => t(`cyc.${w}`)).join(' / ');

  function chip(c) {
    const ic = el('span', { class: 'cyc-ic' });
    ic.innerHTML = glyphFor(c.state); // constante estática, nunca dado da API
    return el('span', { class: `cyc cyc-${c.state}`, role: 'listitem', dataset: { cyc: c.id } }, [
      ic,
      el('span', { class: 'cyc-w', text: worldLabel(c) }),
      el('span', { class: 'cyc-state', text: stateLabel(c.state) }),
      el('span', { class: 'cyc-t', text: '' }),
    ]);
  }

  function render() {
    if (!cycles || !cycles.length) return;
    const sorted = [...cycles].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    inner.replaceChildren(...sorted.map(chip));
    tick();
  }

  function tick() {
    if (!cycles) return;
    const now = Date.now();
    let expired = false;
    for (const node of inner.querySelectorAll('[data-cyc]')) {
      const c = cycles.find((x) => x.id === node.dataset.cyc);
      if (!c) continue;
      const ms = Date.parse(c.expiry) - now;
      if (ms <= 0) expired = true;
      node.querySelector('.cyc-t').textContent = fmtLeft(ms);
      node.classList.toggle('soon', ms > 0 && ms < 60 * 1000);
      const ns = nextState(c);
      if (ns) {
        node.title = t('cyc.next', { w: t(`cyc.${c.id}`), s: stateLabel(ns), t: fmtLeft(ms) });
        node.setAttribute('aria-label', node.title);
      }
    }
    // ciclo virou: re-busca (com folga de 5s p/ não martelar se o servidor demorar)
    if (expired && !loading && now - lastLoad > 5000) load();
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const data = await api('/api/cycles');
      cycles = Array.isArray(data.cycles) ? data.cycles : [];
      lastLoad = Date.now();
      strip.hidden = cycles.length === 0;
      render();
    } catch {
      if (!cycles || !cycles.length) strip.hidden = true; // sem dado nenhum: some quieto
    } finally {
      loading = false;
    }
  }

  // skeleton imediato (nomes dos mundos) enquanto a primeira resposta não chega.
  // O rótulo do Cetus já inclui a Terra para casar com o dado real (evita o chip
  // crescer "Cetus"→"Cetus / Terra" quando a resposta chega).
  const SKELETON_WORLDS = { cetus: ['cetus', 'earth'] };
  inner.replaceChildren(...ORDER.map((id) =>
    el('span', { class: 'cyc cyc-skel', role: 'listitem' }, [
      el('span', { class: 'cyc-w', text: (SKELETON_WORLDS[id] || [id]).map((w) => t(`cyc.${w}`)).join(' / ') }),
      el('span', { class: 'cyc-t', text: '…' }),
    ])));

  load();
  setInterval(tick, 1000);
  setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastLoad > 60 * 1000) load();
  });
})();
