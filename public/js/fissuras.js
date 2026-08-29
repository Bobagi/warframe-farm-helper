'use strict';

/**
 * Página de fissuras: lista as fissuras ativas (Normais/Steel Path/Railjack) e,
 * abaixo, os sets prime que dá pra farmar AGORA - cruzando os tiers com fissura
 * ativa × relíquias disponíveis desses tiers (dados de /api/farmable). Filtra os
 * cards pelo tier da relíquia que o jogador tem.
 */

(() => {
  const { el, api, startTimers, tierBadge, farmCard, wsMsg } = App;
  const { t, missionName, enemyName } = I18n;
  const placeName = (n) => (I18n.lang() === 'pt' || I18n.lang() === 'zh' ? Places.placeIn(n, I18n.lang()) : n);

  // ---- fissuras (mesma lógica da home) ----
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
    for (const b of ev.currentTarget.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
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

  // ---- dá pra farmar agora ----
  const TIERS = ['Lith', 'Meso', 'Neo', 'Axi'];
  // dificuldade de farmar = quão alto é o tier de relíquia exigido (Lith é o mais
  // fácil/cedo, Axi o mais difícil/tardio). Requiem fora dos primes normais.
  const TIER_RANK = { Lith: 0, Meso: 1, Neo: 2, Axi: 3, Requiem: 4 };
  const maxTier = (it) => Math.max(...it.tiers.map((tr) => (tr in TIER_RANK ? TIER_RANK[tr] : 9)));
  const minTier = (it) => Math.min(...it.tiers.map((tr) => (tr in TIER_RANK ? TIER_RANK[tr] : 9)));
  let items = [];
  let fallbackAt = null; // ISO da foto usada quando o warframestat está fora
  let tierFilter = 'all';
  let sortBy = 'value'; // 'value' (ordem do backend, por platina) | 'difficulty'
  const grid = document.getElementById('farm-grid');
  const farmHint = document.getElementById('farm-hint');
  const farmMode = document.getElementById('farm-mode');
  const farmSort = document.getElementById('farm-sort');
  grid.replaceChildren(el('p', { class: 'spin', text: t('farm.loading') }));

  // ordena os mais FÁCEIS primeiro: menor tier exigido (o teto), depois o piso,
  // e desempata pela platina (mais valioso primeiro).
  function sortItems(arr) {
    if (sortBy !== 'difficulty') return arr;
    return [...arr].sort((a, b) => maxTier(a) - maxTier(b)
      || minTier(a) - minTier(b)
      || (b.platinum || 0) - (a.platinum || 0));
  }

  function renderFarm() {
    const filtered = tierFilter === 'all' ? items : items.filter((it) => it.tiers.includes(tierFilter));
    const shown = sortItems(filtered);
    // fonte fora do ar: os itens vêm da última foto salva - alerta datado fixo
    const alert = fallbackAt
      ? [el('p', { class: 'error-box' }, wsMsg('ws.fallback', { when: I18n.fmtWhen(fallbackAt) }))]
      : [];
    grid.replaceChildren(...alert, ...(shown.length
      ? shown.map(farmCard)
      : [el('p', { class: 'empty', text: t('farm.none') })]));
  }

  farmSort.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-sort]');
    if (!btn) return;
    sortBy = btn.dataset.sort;
    for (const b of farmSort.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
    renderFarm();
  });

  function buildFilter(activeTiers) {
    const mk = (val, label) => el('button', {
      type: 'button', dataset: { tier: val }, 'aria-pressed': String(val === tierFilter), text: label,
    });
    const btns = [mk('all', t('farm.all'))];
    for (const tr of TIERS) if (activeTiers.includes(tr)) btns.push(mk(tr, tr));
    farmMode.replaceChildren(...btns);
    farmMode.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-tier]');
      if (!btn) return;
      tierFilter = btn.dataset.tier;
      for (const b of farmMode.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
      renderFarm();
    });
  }

  api('/api/farmable').then((data) => {
    items = data.items || [];
    fallbackAt = data.fallback ? data.fallback.savedAt : null;
    farmHint.textContent = t('farm.count', { n: items.length });
    if (!items.length) {
      farmHint.textContent = '';
      const degraded = data.source && data.source !== 'ok';
      grid.replaceChildren(el('p', { class: 'empty' }, degraded ? wsMsg('ws.down') : [t('farm.noTiers')]));
      return;
    }
    buildFilter(data.tiers || []);
    renderFarm();
  }).catch(() => {
    grid.replaceChildren(el('p', { class: 'error-box' }, wsMsg('ws.down')));
  });
})();
