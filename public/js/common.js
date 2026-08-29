'use strict';

/* Helpers compartilhados - renderização sempre via DOM APIs (textContent),
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

  /**
   * Esquema seguro para href montado a partir de DADO (API nossa, WFCD,
   * worldstate). Aceita só caminho interno ("/x", nunca "//host" que é
   * protocol-relative) ou http(s) explícito; qualquer outro esquema
   * (`javascript:`, `data:`, `vbscript:`) vira null e o el() omite o atributo.
   * A CSP `script-src 'self'` já barra a execução de `javascript:`: isto é a
   * segunda camada, para o caso de um dado externo chegar envenenado.
   */
  function safeHref(url) {
    const s = String(url == null ? '' : url).trim();
    if (/^\/(?!\/)/.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }

  /**
   * Mensagens ws.down/ws.fallback (i18n.js) citam "warframestat.us" - vira
   * link clicável pro próprio usuário conferir se a fonte está mesmo fora
   * do ar, em vez de só confiar na palavra do site. Retorna array de nodes
   * (texto + <a>) pra passar como children de um el().
   */
  function wsMsg(key, vars) {
    const parts = I18n.t(key, vars).split('warframestat.us');
    const nodes = [];
    parts.forEach((part, i) => {
      if (part) nodes.push(part);
      if (i < parts.length - 1) {
        nodes.push(el('a', { href: 'https://warframestat.us', rel: 'noopener', target: '_blank', text: 'warframestat.us' }));
      }
    });
    return nodes;
  }

  /**
   * Escolhe o aviso certo pra fonte degradada: 'stale' com `asOf` conhecido
   * (o upstream respondeu, só que atrasado - dá pra dizer de quando é o
   * dado) vira ws.stale datado; qualquer outro caso degradado (fetch falhou,
   * nada aproveitável) vira ws.down genérico, sem data pra mostrar.
   */
  function wsDegradedMsg(source, asOf) {
    return (source === 'stale' && asOf)
      ? wsMsg('ws.stale', { when: I18n.fmtWhen(asOf) })
      : wsMsg('ws.down');
  }

  const qs = (name) => new URLSearchParams(location.search).get(name);

  /** URL bonita da relíquia ("Lith K12" → "/relic/lith-k12") - espelha o server */
  const relicUrl = (name) => `/relic/${String(name).trim().toLowerCase().replace(/\s+/g, '-')}`;

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { Accept: 'application/json' }, ...opts });
    if (!res.ok) {
      let msg = `Erro ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* mantém msg */ }
      throw new Error(msg);
    }
    return res.json();
  }

  const fmtInt = (n) => Number(n).toLocaleString(I18n.locale());
  const fmtPct = (n) => (n == null ? '-' : (I18n.lang() === 'en' ? `${n}%` : `${String(n).replace('.', ',')}%`));

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

  /**
   * Atualiza countdowns de elementos com [data-expiry] a cada segundo. Se o
   * timer vive dentro de um .row (fissura), a linha inteira ganha a classe
   * "expired" quando o prazo vence - marca visualmente uma fissura que já
   * fechou no jogo real, mesmo que ela ainda apareça na lista (fonte
   * degradada servindo dado atrasado; ver [[ws.down]]).
   */
  function startTimers() {
    const tick = () => {
      for (const node of document.querySelectorAll('[data-expiry]')) {
        const left = timeLeft(node.dataset.expiry);
        node.textContent = left;
        const ms = Date.parse(node.dataset.expiry) - Date.now();
        node.classList.toggle('soon', ms > 0 && ms < 5 * 60 * 1000);
        const row = node.closest('.row');
        if (row) row.classList.toggle('expired', ms <= 0);
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  // O TEXTO do selo é traduzido (中纪), mas a CLASSE segue o tier cru: é ela que
  // dá a cor de cada tier no CSS, e traduzir a classe quebraria o tema.
  const tierBadge = (tier) =>
    el('span', { class: `badge badge-tier tier-${tier}`, text: I18n.tierName(tier) });

  const rarityChip = (rarity) =>
    el('span', { class: `chip-rar rar-${rarity || 'Common'}`, text: I18n.t(`rar.${rarity}`) });

  const statusBadge = (vaulted) => (vaulted
    ? el('span', { class: 'badge badge-vaulted', text: I18n.t('status.vaulted') })
    : el('span', { class: 'badge badge-ok', text: I18n.t('status.available') }));

  function resultRow(r) {
    const left = [];
    if (r.image) left.push(el('img', { src: r.image, alt: '', loading: 'lazy' }));
    return el('a', { class: 'row row-link result-item', href: safeHref(r.url) }, [
      ...left,
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: I18n.nameFor(r) }),
        el('br'),
        el('span', { class: 'sub', text: I18n.subLabel(r) }),
      ]),
      el('span', { class: 'kind-tag', text: I18n.t(`kind.${r.kind}`) }),
    ]);
  }

  /** card de "dá pra farmar agora": arte + nome + badges de tier + preço (pl) */
  function farmCard(it) {
    return el('a', { class: 'card farm-card', href: safeHref(it.url) }, [
      el('div', { class: 'farm-card-top' }, [
        it.image ? el('img', { class: 'farm-art', src: it.image, alt: '', loading: 'lazy' }) : null,
        el('span', { class: 't', text: I18n.nameFor(it) }),
      ]),
      el('div', { class: 'farm-tiers' }, [
        ...it.tiers.map((tr) => tierBadge(tr)),
        el('span', {
          class: `farm-plat${it.platinum == null ? ' dim' : ''}`,
          // "pl" é abreviação latina de platina: em chinês vira 白金
          text: it.platinum == null ? '-'
            : `${it.platinum} ${I18n.lang() === 'zh' ? I18n.t('cur.Platinum') : 'pl'}`,
        }),
      ]),
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
    // "última vence": cancela a query anterior em voo e descarta respostas
    // obsoletas, para o dropdown nunca mostrar resultado de um texto antigo
    const runner = Latest.createLatestRunner();

    const close = () => { runner.cancel(); suggestBox.hidden = true; suggestBox.replaceChildren(); active = -1; };

    const render = () => {
      suggestBox.replaceChildren();
      items.forEach((r, i) => {
        // <a href> real → middle-click / ctrl-click / "abrir em nova guia"
        // funcionam nativamente; o click esquerdo navega na mesma aba
        const rowEl = el('a', { class: `sg${i === active ? ' active' : ''}`, role: 'option', href: safeHref(r.url) }, [
          r.image ? el('img', { src: r.image, alt: '', loading: 'lazy' }) : null,
          el('span', { text: I18n.nameFor(r) }),
          el('span', { class: 'sg-sub', text: I18n.subLabel(r) }),
        ]);
        // só o clique ESQUERDO simples não deve tirar o foco do input antes de
        // navegar; middle/ctrl/meta passam direto para o browser abrir nova aba
        rowEl.addEventListener('mousedown', (ev) => {
          if (ev.button === 0 && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) ev.preventDefault();
        });
        suggestBox.append(rowEl);
      });
      suggestBox.hidden = items.length === 0;
    };

    const load = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      try {
        const res = await runner.run((signal) =>
          api(`/api/suggest?q=${encodeURIComponent(q)}`, { signal }));
        // resposta obsoleta (uma busca mais nova começou) ou o input já mudou
        // desde o disparo → descarta, não renderiza resultado velho
        if (res.superseded || q !== input.value.trim()) return;
        items = res.value.results || [];
        active = -1;
        render();
      } catch (err) {
        if (err && err.name === 'AbortError') return; // cancelamento esperado
        close();
      }
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

  /** marca o link ativo no menu (casa também subcaminhos: /faq/slug → /faq) */
  function navCurrent() {
    const here = location.pathname.replace(/\/$/, '') || '/';
    for (const a of document.querySelectorAll('.site-nav a')) {
      const target = new URL(a.href).pathname.replace(/\/$/, '') || '/';
      if (target === here || (target !== '/' && here.startsWith(`${target}/`))) {
        a.setAttribute('aria-current', 'page');
      }
    }
  }

  return {
    el, qs, relicUrl, api, fmtInt, fmtPct, timeLeft, startTimers,
    tierBadge, rarityChip, statusBadge, resultRow, farmCard, attachSearch, debounce, navCurrent,
    safeHref, wsMsg, wsDegradedMsg,
  };
})();
// navCurrent é chamado por layout.js, depois de o cabeçalho ser construído
