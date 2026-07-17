'use strict';

(() => {
  const { el, api, startTimers, tierBadge } = App;
  const { t, missionName, enemyName } = I18n;
  const placeName = (n) => (I18n.lang() === 'pt' ? Places.placePt(n) : n);

  // (a busca vive fixa no cabeçalho — sem barra duplicada no hero)

  // chips de exemplo (traduzíveis)
  const chips = [
    { k: 'ex.bratonStock', q: 'Braton Prime Stock' },
    { k: 'ex.kubrow', q: 'o que fazer com kubrow' },
    { k: 'ex.apothic', q: 'Apótico do Anoitecer' },
    { k: 'ex.crewship', href: '/nightwave.html?slug=10-artilharia-frontal-crewship' },
  ];
  document.getElementById('example-chips').replaceChildren(...chips.map((c) =>
    el('a', { href: c.href || `/buscar.html?q=${encodeURIComponent(c.q)}`, text: t(c.k) })));

  // ---- fissuras ----
  let fissures = [];
  let mode = 'normal';
  const list = document.getElementById('fiss-list');
  const hint = document.getElementById('fiss-hint');
  list.replaceChildren(el('li', { class: 'spin', text: t('fissures.loading') }));

  const fissRow = (f) => el('li', { class: 'row' }, [
    tierBadge(f.tier),
    el('span', { class: 'grow' }, [
      el('span', { class: 'name', text: missionName(f.missionType) }),
      el('br'),
      el('span', { class: 'sub', text: `${placeName(f.node)} · ${enemyName(f.enemy)}` }),
    ]),
    el('span', { class: 'time num', dataset: { expiry: f.expiry } }),
  ]);

  function renderFissures() {
    const filtered = fissures.filter((f) => (
      mode === 'hard' ? f.isHard : mode === 'storm' ? f.isStorm : (!f.isHard && !f.isStorm)
    ));
    list.replaceChildren(...(filtered.length
      ? filtered.map(fissRow)
      : [el('li', { class: 'empty', text: t('fissures.none') })]));
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
    hint.textContent = t('fissures.active', { n: fissures.length });
    renderFissures();
    startTimers();
  }).catch(() => {
    list.replaceChildren(el('li', { class: 'error-box', text: t('fissures.down') }));
  });

  // ---- nightwave (mini) ----
  const nwList = document.getElementById('nw-list');
  nwList.replaceChildren(el('li', { class: 'spin', text: t('nw.loading') }));
  api('/api/nightwave').then((data) => {
    const acts = (data.acts || []).slice(0, 5);
    if (!acts.length) {
      nwList.replaceChildren(el('li', { class: 'empty', text: t('nw.none') }));
      return;
    }
    nwList.replaceChildren(...acts.map((a) => el('li', { class: `row act${a.guide ? ' has-guide' : ''}` }, [
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: a.title }),
        el('br'),
        el('span', { class: 'sub', text: a.desc }),
      ]),
      a.guide
        ? el('a', { class: 'guide-btn', href: `/nightwave.html?slug=${encodeURIComponent(a.guide.slug)}`, text: t('nw.guide') })
        : el('span', { class: 'kind-tag', text: a.isDaily ? t('nw.daily') : a.isElite ? t('nw.elite') : t('nw.weekly') }),
    ])));
  }).catch(() => {
    nwList.replaceChildren(el('li', { class: 'empty', text: t('nw.down') }));
  });

  // ---- baro ----
  const baro = document.getElementById('baro-body');
  baro.textContent = t('baro.loading');
  api('/api/baro').then(({ baro: b }) => {
    if (!b) { baro.textContent = t('baro.none'); return; }
    baro.replaceChildren(
      b.active
        ? el('span', {}, [
          t('baro.here', { loc: b.location || '—', n: b.items }),
          el('span', { class: 'num', dataset: { expiry: b.expiry } }),
        ])
        : el('span', {}, [
          t('baro.coming'),
          el('span', { class: 'num', dataset: { expiry: b.activation } }),
          t('baro.comingTail', { loc: b.location || '—' }),
        ])
    );
    startTimers();
  }).catch(() => { baro.textContent = t('baro.down'); });

  // ---- dá pra farmar agora (top por valor) ----
  const farmGrid = document.getElementById('farm-home-grid');
  const farmHint = document.getElementById('farm-home-hint');
  farmGrid.replaceChildren(el('p', { class: 'spin', text: t('farm.loading') }));
  api('/api/farmable').then((data) => {
    const list = (data.items || []).slice(0, 9); // os 9 mais valiosos
    if (!list.length) {
      farmGrid.replaceChildren(el('p', { class: 'empty', text: t('farm.noTiers') }));
      return;
    }
    farmHint.textContent = t('farm.count', { n: (data.items || []).length });
    farmGrid.replaceChildren(...list.map(App.farmCard));
  }).catch(() => { farmGrid.replaceChildren(el('p', { class: 'empty', text: t('farm.down') })); });

  // ---- faq teaser ----
  const cards = document.getElementById('faq-cards');
  api('/api/faq').then((data) => {
    cards.replaceChildren(...(data.articles || []).slice(0, 6).map((a) =>
      el('a', { class: 'card', href: `/faq.html?slug=${encodeURIComponent(a.slug)}` }, [
        el('span', { class: 't', text: a.title }),
      ])));
  }).catch(() => { /* teaser opcional */ });
})();
