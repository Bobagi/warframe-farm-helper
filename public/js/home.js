'use strict';

(() => {
  const { el, api, attachSearch, startTimers, tierBadge } = App;

  // busca hero
  const form = document.getElementById('search-form');
  const input = document.getElementById('q');
  attachSearch(input, document.getElementById('suggest'));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (q) location.href = `/buscar.html?q=${encodeURIComponent(q)}`;
  });

  // fissuras
  let fissures = [];
  let mode = 'normal';
  const list = document.getElementById('fiss-list');
  const hint = document.getElementById('fiss-hint');

  function fissRow(f) {
    return el('li', { class: 'row' }, [
      tierBadge(f.tier),
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: f.missionType }),
        el('br'),
        el('span', { class: 'sub', text: `${f.node} · ${f.enemy}` }),
      ]),
      el('span', { class: 'time num', dataset: { expiry: f.expiry } }),
    ]);
  }

  function renderFissures() {
    const filtered = fissures.filter((f) => (
      mode === 'hard' ? f.isHard : mode === 'storm' ? f.isStorm : (!f.isHard && !f.isStorm)
    ));
    list.replaceChildren(...(filtered.length
      ? filtered.map(fissRow)
      : [el('li', { class: 'empty', text: 'Nenhuma fissura desse tipo agora.' })]));
  }

  document.getElementById('fiss-mode').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-mode]');
    if (!btn) return;
    mode = btn.dataset.mode;
    for (const b of ev.currentTarget.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
    renderFissures();
  });

  api('/api/fissures').then((data) => {
    fissures = data.fissures || [];
    hint.textContent = `${fissures.length} ativas`;
    renderFissures();
    startTimers();
  }).catch(() => {
    list.replaceChildren(el('li', { class: 'error-box', text: 'Worldstate indisponível agora — tente recarregar.' }));
  });

  // nightwave (mini)
  const nwList = document.getElementById('nw-list');
  api('/api/nightwave').then((data) => {
    const acts = (data.acts || []).slice(0, 5);
    if (!acts.length) {
      nwList.replaceChildren(el('li', { class: 'empty', text: 'Sem atos ativos agora (intervalo de temporada).' }));
      return;
    }
    nwList.replaceChildren(...acts.map((a) => el('li', { class: `row act${a.guide ? ' has-guide' : ''}` }, [
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: a.title }),
        el('br'),
        el('span', { class: 'sub', text: a.desc }),
      ]),
      a.guide
        ? el('a', { class: 'guide-btn', href: `/nightwave.html?slug=${encodeURIComponent(a.guide.slug)}`, text: 'Guia' })
        : el('span', { class: 'kind-tag', text: a.isDaily ? 'diário' : a.isElite ? 'elite' : 'semanal' }),
    ])));
  }).catch(() => {
    nwList.replaceChildren(el('li', { class: 'empty', text: 'Nightwave indisponível agora.' }));
  });

  // baro
  const baro = document.getElementById('baro-body');
  api('/api/baro').then(({ baro: b }) => {
    if (!b) { baro.textContent = 'Sem dados do Void Trader agora.'; return; }
    baro.replaceChildren(
      b.active
        ? el('span', {}, [
          `Na relay ${b.location || '—'} com ${b.items} itens · vai embora em `,
          el('span', { class: 'num', dataset: { expiry: b.expiry } }),
        ])
        : el('span', {}, [
          `Chega em `,
          el('span', { class: 'num', dataset: { expiry: b.activation } }),
          ` (${b.location || 'relay a confirmar'}). Junte ducats!`,
        ])
    );
    startTimers();
  }).catch(() => { baro.textContent = 'Void Trader indisponível agora.'; });

  // faq teaser
  const cards = document.getElementById('faq-cards');
  api('/api/faq').then((data) => {
    cards.replaceChildren(...(data.articles || []).slice(0, 6).map((a) =>
      el('a', { class: 'card', href: `/faq.html?slug=${encodeURIComponent(a.slug)}` }, [
        el('span', { class: 't', text: a.title }),
      ])));
  }).catch(() => { /* teaser é opcional */ });
})();
