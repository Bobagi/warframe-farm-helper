'use strict';

(() => {
  const { el, api, qs } = App;
  const { t } = I18n;
  const root = document.getElementById('content');

  async function showArticle(slug) {
    const art = await api(`/api/article/${encodeURIComponent(slug)}`);
    document.title = `${art.title} — Warframe Farm Helper`;
    const body = el('div', { class: 'art-body' });
    // conteúdo local confiável (markdown do repositório, sanitizado na ingestão)
    body.innerHTML = art.html;
    root.replaceChildren(
      el('p', { class: 'small', style: 'margin:0 0 12px' }, [
        el('a', { href: '/faq.html', text: t('faq.back') }),
      ]),
      el('article', { class: 'panel article' }, [
        el('h1', { text: art.title }),
        body,
      ])
    );
  }

  async function showList() {
    const data = await api('/api/faq');
    root.replaceChildren(
      el('section', { class: 'hero', style: 'padding-top:8px' }, [
        el('h1', { text: t('faq.title') }),
        el('p', { class: 'lead', text: t('faq.lead') }),
      ]),
      el('section', { class: 'panel panel-quiet' }, [
        el('div', { class: 'card-grid' }, (data.articles || []).map((a) =>
          el('a', { class: 'card', href: `/faq.html?slug=${encodeURIComponent(a.slug)}` }, [
            el('span', { class: 't', text: a.title }),
          ]))),
      ])
    );
  }

  const slug = qs('slug');
  (slug ? showArticle(slug) : showList()).catch((err) => {
    root.replaceChildren(el('div', { class: 'error-box', text: t('search.failed', { e: err.message }) }));
  });
})();
