'use strict';

/**
 * Monta o cabeçalho (marca + navegação + BUSCA FIXA com autocomplete + toggle
 * de idioma) e o rodapé, iguais em todas as páginas. Injeta nos placeholders
 * `#site-header` / `#site-footer`. Roda de forma síncrona (script no fim do
 * body, depois de i18n.js e common.js).
 */

(() => {
  const { el, attachSearch } = App;
  const { t, lang, setLang, applyStatic } = I18n;

  const NAV = [
    { key: 'nav.search', href: '/buscar.html' },
    { key: 'nav.fissures', href: '/#fissuras' },
    { key: 'nav.nightwave', href: '/nightwave.html' },
    { key: 'nav.faq', href: '/faq.html' },
  ];

  function buildHeader(mount) {
    const input = el('input', {
      id: 'head-q', type: 'search', autocomplete: 'off',
      placeholder: t('search.placeholder'), 'aria-label': t('search.aria'),
    });
    const suggest = el('div', { class: 'suggest head-suggest', id: 'head-suggest', role: 'listbox', hidden: '' });
    const form = el('form', { class: 'head-search', role: 'search' }, [
      el('div', { class: 'head-console' }, [
        input,
        el('button', { type: 'submit', 'aria-label': t('search.button') }, [
          el('span', { 'aria-hidden': 'true', text: '⌕' }),
        ]),
      ]),
      suggest,
    ]);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = input.value.trim();
      if (q) location.href = `/buscar.html?q=${encodeURIComponent(q)}`;
    });

    const nav = el('nav', { class: 'site-nav', 'aria-label': 'Principal' },
      NAV.map((n) => el('a', { href: n.href, text: t(n.key) })));

    const langToggle = el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('lang.aria') },
      I18n.SUPPORTED.map((l) => el('button', {
        type: 'button', dataset: { lang: l }, 'aria-pressed': String(l === lang()),
        text: l.toUpperCase(), onclick: () => setLang(l),
      })));

    mount.replaceChildren(el('div', { class: 'head-inner wrap' }, [
      el('a', { class: 'brand', href: '/' }, ['WARFRAME ', el('span', { text: t('brand.sub') })]),
      nav,
      form,
      langToggle,
    ]));

    attachSearch(input, suggest);
  }

  function buildFooter(mount) {
    const link = (href, text) => el('a', { href, rel: 'noopener', target: '_blank', text });
    mount.replaceChildren(el('div', { class: 'wrap' }, [
      el('p', { class: 'foot-brand', text: 'WARFRAME FARM HELPER' }),
      el('p', { text: t('foot.disclaimer') }),
      el('p', {}, [
        `${t('foot.data')} `, link('https://github.com/WFCD', 'WFCD'), ` ${t('foot.dropSrc')} · `,
        `${t('foot.state')} `, link('https://docs.warframestat.us', 'warframestat.us'), ' · ',
        `${t('foot.prices')} `, link('https://warframe.market', 'warframe.market'), '.',
      ]),
      el('p', {}, [
        `${t('foot.code')} `, link('https://github.com/Bobagi/warframe-farm-helper', 'github.com/Bobagi/warframe-farm-helper'),
      ]),
    ]));
  }

  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  if (header) buildHeader(header);
  if (footer) buildFooter(footer);
  applyStatic(document);
  App.navCurrent();
})();
