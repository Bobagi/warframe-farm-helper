'use strict';

/* Helpers compartilhados — renderização sempre via DOM APIs (textContent),
   nunca innerHTML com dados externos. */

const App = (() => {
  /** cria elemento: el('div', {class:'x', href:'y'}, [filhos|strings]) */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  const qs = (name) => new URLSearchParams(location.search).get(name);

  async function api(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* mantém msg */ }
      throw new Error(msg);
    }
    return res.json();
  }

  const fmtInt = (n) => Number(n).toLocaleString(I18n.lang() === 'en' ? 'en-US' : 'pt-BR');
  const fmtPct = (n) => (n == null ? '—' : (I18n.lang() === 'en' ? `${n}%` : `${String(n).replace('.', ',')}%`));

  function timeLeft(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!Number.isFinite(ms)) return '';
    if (ms <= 0) return 'expirou';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  }

  /** atualiza countdowns de elementos com [data-expiry] a cada segundo */
  function startTimers() {
    const tick = () => {
      for (const node of document.querySelectorAll('[data-expiry]')) {
        const left = timeLeft(node.dataset.expiry);
        node.textContent = left;
        const ms = Date.parse(node.dataset.expiry) - Date.now();
        node.classList.toggle('soon', ms > 0 && ms < 5 * 60 * 1000);
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  const tierBadge = (tier) =>
    el('span', { class: `badge badge-tier tier-${tier}`, text: tier });

  const rarityChip = (rarity) =>
    el('span', { class: `chip-rar rar-${rarity || 'Common'}`, text: I18n.t(`rar.${rarity}`) });

  const statusBadge = (vaulted) => (vaulted
    ? el('span', { class: 'badge badge-vaulted', text: I18n.t('status.vaulted') })
    : el('span', { class: 'badge badge-ok', text: I18n.t('status.available') }));

  function resultRow(r) {
    const left = [];
    if (r.image) left.push(el('img', { src: r.image, alt: '', loading: 'lazy' }));
    return el('a', { class: 'row row-link result-item', href: r.url }, [
      ...left,
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: I18n.nameFor(r) }),
        el('br'),
        el('span', { class: 'sub', text: I18n.subLabel(r) }),
      ]),
      el('span', { class: 'kind-tag', text: I18n.t(`kind.${r.kind}`) }),
    ]);
  }

  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  /** autocomplete acoplado a um input dentro de .console-wrap */
  function attachSearch(input, suggestBox) {
    let items = [];
    let active = -1;

    const close = () => { suggestBox.hidden = true; suggestBox.replaceChildren(); active = -1; };

    const render = () => {
      suggestBox.replaceChildren();
      items.forEach((r, i) => {
        const rowEl = el('div', { class: `sg${i === active ? ' active' : ''}`, role: 'option' }, [
          r.image ? el('img', { src: r.image, alt: '', loading: 'lazy' }) : null,
          el('span', { text: I18n.nameFor(r) }),
          el('span', { class: 'sg-sub', text: I18n.subLabel(r) }),
        ]);
        rowEl.addEventListener('mousedown', (ev) => { ev.preventDefault(); location.href = r.url; });
        suggestBox.append(rowEl);
      });
      suggestBox.hidden = items.length === 0;
    };

    const load = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      try {
        const data = await api(`/api/suggest?q=${encodeURIComponent(q)}`);
        items = data.results || [];
        active = -1;
        render();
      } catch { close(); }
    }, 180);

    input.addEventListener('input', load);
    input.addEventListener('keydown', (ev) => {
      if (suggestBox.hidden) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = Math.max(active - 1, -1); render(); }
      else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); location.href = items[active].url; }
      else if (ev.key === 'Escape') close();
    });
    document.addEventListener('click', (ev) => {
      if (!suggestBox.contains(ev.target) && ev.target !== input) close();
    });
  }

  /** marca o link ativo no menu */
  function navCurrent() {
    const here = location.pathname.replace(/\/$/, '') || '/index.html';
    for (const a of document.querySelectorAll('.site-nav a')) {
      const target = new URL(a.href).pathname.replace(/\/$/, '') || '/index.html';
      if (target === here || (target === '/index.html' && here === '')) {
        a.setAttribute('aria-current', 'page');
      }
    }
  }

  return {
    el, qs, api, fmtInt, fmtPct, timeLeft, startTimers,
    tierBadge, rarityChip, statusBadge, resultRow, attachSearch, debounce, navCurrent,
  };
})();
// navCurrent é chamado por layout.js, depois de o cabeçalho ser construído
