'use strict';

(() => {
  const { el, api, qs } = App;
  const root = document.getElementById('content');

  async function showArticle(slug) {
    const art = await api(`/api/article/${encodeURIComponent(slug)}`);
    document.title = `${art.title} — Warframe Farm Helper`;
    const body = el('div', { class: 'art-body' });
    // conteúdo local confiável (markdown do repositório, renderizado no servidor)
    body.innerHTML = art.html;
    root.replaceChildren(
      el('p', { class: 'small', style: 'margin:0 0 12px' }, [
        el('a', { href: '/faq.html', text: '← todas as perguntas' }),
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
        el('h1', { text: 'FAQ — mecânicas do jogo' }),
        el('p', { class: 'lead', text: 'As dúvidas que todo Tenno tem — respondidas em português, direto ao ponto.' }),
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
    root.replaceChildren(el('div', { class: 'error-box', text: `Não deu para carregar: ${err.message}` }));
  });
})();
