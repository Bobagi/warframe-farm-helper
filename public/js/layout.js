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
    { key: 'nav.search', href: '/buscar' },
    { key: 'nav.fissures', href: '/fissuras' },
    { key: 'nav.nightwave', href: '/nightwave' },
    { key: 'nav.faq', href: '/faq' },
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
      if (q) location.href = `/buscar?q=${encodeURIComponent(q)}`;
    });

    const nav = el('nav', { class: 'site-nav', 'aria-label': 'Principal' },
      NAV.map((n) => el('a', { href: n.href, text: t(n.key) })));

    // bandeiras (SVG constante - nunca dado externo): 🇧🇷 PT, 🇺🇸 EN, 🇪🇸 ES, 🇷🇺 RU
    const FLAGS = {
      pt: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#009b3a"/><path d="M10 1.6 18.4 7 10 12.4 1.6 7Z" fill="#fedf00"/><circle cx="10" cy="7" r="3" fill="#002776"/></svg>',
      en: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/><g fill="#b22234"><rect width="20" height="1.08" y="0"/><rect width="20" height="1.08" y="2.15"/><rect width="20" height="1.08" y="4.3"/><rect width="20" height="1.08" y="6.46"/><rect width="20" height="1.08" y="8.6"/><rect width="20" height="1.08" y="10.77"/><rect width="20" height="1.08" y="12.92"/></g><rect width="9" height="7.54" fill="#3c3b6e"/></svg>',
      es: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#c60b1e"/><rect width="20" height="7" y="3.5" fill="#ffc400"/></svg>',
      ru: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#fff"/><rect width="20" height="4.67" y="4.66" fill="#0039a6"/><rect width="20" height="4.67" y="9.33" fill="#d52b1e"/></svg>',
      zh: '<svg viewBox="0 0 20 14" aria-hidden="true"><rect width="20" height="14" fill="#ee1c25"/><path fill="#ffde00" d="M3.70,1.50L4.26,3.23L6.08,3.23L4.61,4.30L5.17,6.02L3.70,4.96L2.23,6.02L2.79,4.30L1.32,3.23L3.14,3.23Z M7.92,0.81L7.90,1.50L8.55,1.73L7.89,1.92L7.86,2.61L7.48,2.04L6.81,2.23L7.24,1.69L6.85,1.12L7.50,1.35Z M9.71,2.57L9.45,3.21L9.98,3.66L9.29,3.61L9.03,4.25L8.87,3.58L8.18,3.53L8.76,3.16L8.60,2.49L9.13,2.94Z M9.92,5.03L9.46,5.54L9.81,6.14L9.18,5.85L8.71,6.37L8.79,5.68L8.16,5.40L8.83,5.26L8.90,4.57L9.25,5.17Z M8.54,6.84L7.93,7.16L8.05,7.84L7.55,7.36L6.94,7.68L7.24,7.06L6.75,6.58L7.43,6.68L7.73,6.06L7.85,6.74Z"/></svg>',
    };
    const FLAG_LABEL = { pt: 'Português', en: 'English', es: 'Español', ru: 'Русский', zh: '简体中文' };
    const langToggle = el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('lang.aria') },
      I18n.SUPPORTED.map((l) => {
        const btn = el('button', {
          type: 'button', class: 'lang-flag', dataset: { lang: l },
          'aria-pressed': String(l === lang()), 'aria-label': FLAG_LABEL[l], title: FLAG_LABEL[l],
          onclick: () => setLang(l),
        });
        btn.innerHTML = FLAGS[l]; // constante estática, nunca entra dado externo
        return btn;
      }));

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
