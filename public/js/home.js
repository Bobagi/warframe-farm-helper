'use strict';

(() => {
  const { el, api, startTimers, tierBadge, wsMsg } = App;
  const { t, missionName, enemyName } = I18n;
  const placeName = (n) => (I18n.lang() === 'pt' || I18n.lang() === 'zh' ? Places.placeIn(n, I18n.lang()) : n);

  // (a busca vive fixa no cabeçalho - sem barra duplicada no hero)

  // chips de exemplo (traduzíveis)
  const chips = [
    { k: 'ex.bratonStock', q: 'Braton Prime Stock' },
    { k: 'ex.kubrow', q: 'o que fazer com kubrow' },
    { k: 'ex.apothic', q: 'Apótico do Anoitecer' },
    { k: 'ex.crewship', href: '/nightwave/10-artilharia-frontal-crewship' },
  ];
  document.getElementById('example-chips').replaceChildren(...chips.map((c) =>
    el('a', { href: c.href || `/buscar?q=${encodeURIComponent(c.q)}`, text: t(c.k) })));

  // ---- fissuras ----
  let fissures = [];
  let fissDegraded = false; // warframestat fora do ar/atrasado: TODA aba avisa
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
    // fonte degradada: o aviso vale para TODAS as abas (trocar de aba
    // re-renderiza, e "nenhuma fissura desse tipo" seria mentira)
    list.replaceChildren(...(filtered.length
      ? filtered.map(fissRow)
      : [fissDegraded
        ? el('li', { class: 'error-box' }, wsMsg('ws.down'))
        : el('li', { class: 'empty', text: t('fissures.none') })]));
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
    // upstream respondeu mas tudo veio expirado: espelho do warframestat
    // travado no tempo - avisa a verdade em vez de "0 fissuras"
    fissDegraded = !fissures.length && !!data.source && data.source !== 'ok';
    hint.textContent = fissDegraded ? '' : t('fissures.active', { n: fissures.length });
    renderFissures();
    if (!fissDegraded) startTimers();
  }).catch(() => {
    fissDegraded = true;
    hint.textContent = '';
    renderFissures();
  });

  // ---- nightwave (mini) ----
  const nwList = document.getElementById('nw-list');
  nwList.replaceChildren(el('li', { class: 'spin', text: t('nw.loading') }));
  api(`/api/nightwave?lang=${I18n.lang()}`).then((data) => {
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
        ? el('a', { class: 'guide-btn', href: `/nightwave/${encodeURIComponent(a.guide.slug)}`, text: t('nw.guide') })
        : el('span', { class: 'kind-tag', text: a.isDaily ? t('nw.daily') : a.isElite ? t('nw.elite') : t('nw.weekly') }),
    ])));
  }).catch(() => {
    nwList.replaceChildren(el('li', { class: 'empty' }, wsMsg('ws.down')));
  });

  // ---- baro ----
  const baro = document.getElementById('baro-body');
  // fallback EN cobre a janela de cache do CF (este arquivo novo + i18n.js velho)
  const guideLabel = t('baro.guide') === 'baro.guide' ? 'Ducats guide' : t('baro.guide');
  const baroGuide = () => el('p', { class: 'panel-cta', style: 'margin-top:10px' }, [
    el('a', { class: 'btn-line', href: '/faq/22-ducats-baro', text: guideLabel }),
  ]);
  baro.textContent = t('baro.loading');
  api('/api/baro').then(({ baro: b }) => {
    if (!b) { baro.replaceChildren(el('span', { text: t('baro.none') }), baroGuide()); return; }
    baro.replaceChildren(
      b.active
        ? el('span', {}, [
          t('baro.here', { loc: placeName(b.location || '-'), n: b.items }),
          el('span', { class: 'num', dataset: { expiry: b.expiry } }),
        ])
        : el('span', {}, [
          t('baro.coming'),
          el('span', { class: 'num', dataset: { expiry: b.activation } }),
          t('baro.comingTail', { loc: placeName(b.location || '-') }),
        ]),
      baroGuide()
    );
    startTimers();
  }).catch(() => { baro.replaceChildren(...wsMsg('ws.down')); });

  // ---- varzia (prime resurgence) ----
  // O painel nasce hidden: rotação é informação de "está rolando agora", então
  // um bloco vazio/quebrado é pior que bloco nenhum.
  const varziaPanel = document.getElementById('varzia');
  const varziaBody = document.getElementById('varzia-body');
  api('/api/varzia').then(({ varzia: v }) => {
    if (!v || !v.primes.length) return;
    // replaceChildren NÃO ignora null (vira o TEXTO "null" na página - ao
    // contrário do el(), que filtra) → monta a lista e filtra antes
    varziaBody.replaceChildren(...[
      el('p', { class: 'muted small' }, [
        t('varzia.until'),
        el('span', { class: 'num', dataset: { expiry: v.expiry } }),
        t('varzia.at', { loc: placeName(v.location) }),
      ]),
      el('ul', { class: 'rowlist' }, v.primes.map((p) => el('li', { class: 'row' }, [
        el('span', { class: 'grow' }, [
          el('a', { class: 'rw-link', href: App.safeHref(p.url) }, [
            el('span', { class: 'name', text: I18n.lang() === 'pt' && p.namePt ? p.namePt : p.name }),
          ]),
        ]),
        el('span', { class: 'chip-rar rar-Uncommon', text: t(`varzia.cat.${p.category === 'Warframes' ? 'frame' : 'weapon'}`) }),
      ]))),
      el('p', { class: 'muted small', text: t('varzia.relics', { n: v.relicCount, tiers: v.tiers.map(I18n.tierName).join(', ') }) }),
      v.next
        ? el('p', { class: 'muted small' }, [t('varzia.next', { item: v.next.item })])
        : null,
      el('p', { class: 'panel-cta' }, [
        el('a', { class: 'btn-line', href: '/faq/24-primes-vaulted', text: t('varzia.how') }),
      ]),
    ].filter(Boolean));
    varziaPanel.hidden = false;
    startTimers();
  }).catch(() => { /* rotação é extra: falha em silêncio, sem painel vazio */ });

  // ---- dá pra farmar agora (top por valor) ----
  const farmGrid = document.getElementById('farm-home-grid');
  const farmHint = document.getElementById('farm-home-hint');
  farmGrid.replaceChildren(el('p', { class: 'spin', text: t('farm.loading') }));
  api('/api/farmable').then((data) => {
    const list = (data.items || []).slice(0, 9); // os 9 mais valiosos
    if (!list.length) {
      const degraded = data.source && data.source !== 'ok';
      farmGrid.replaceChildren(el('p', { class: 'empty' }, degraded ? wsMsg('ws.down') : [t('farm.noTiers')]));
      return;
    }
    farmHint.textContent = t('farm.count', { n: (data.items || []).length });
    // fonte fora do ar: itens vêm da última foto salva - alerta datado em cima
    const alert = data.fallback
      ? [el('p', { class: 'error-box' }, wsMsg('ws.fallback', { when: I18n.fmtWhen(data.fallback.savedAt) }))]
      : [];
    farmGrid.replaceChildren(...alert, ...list.map(App.farmCard));
  }).catch(() => { farmGrid.replaceChildren(el('p', { class: 'empty' }, wsMsg('ws.down'))); });

  // ---- faq teaser ----
  const cards = document.getElementById('faq-cards');
  api(`/api/faq?lang=${I18n.lang()}`).then((data) => {
    cards.replaceChildren(...(data.articles || []).slice(0, 6).map((a) =>
      el('a', { class: 'card', href: `/faq/${encodeURIComponent(a.slug)}` }, [
        el('span', { class: 't', text: a.title }),
      ])));
  }).catch(() => { /* teaser opcional */ });
})();
