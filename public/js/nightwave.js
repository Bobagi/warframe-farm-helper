'use strict';

(() => {
  const { el, api, qs, startTimers } = App;
  const { t } = I18n;
  const root = document.getElementById('content');

  async function showGuide(slug) {
    const art = await api(`/api/article/${encodeURIComponent(slug)}`);
    document.title = `${art.title} — Warframe Farm Helper`;
    const body = el('div', { class: 'art-body' });
    // conteúdo local confiável (markdown do repositório, sanitizado na ingestão)
    body.innerHTML = art.html;
    root.replaceChildren(
      el('p', { class: 'small', style: 'margin:0 0 12px' }, [
        el('a', { href: '/nightwave.html', text: t('nw.backList') }),
      ]),
      el('article', { class: 'panel article' }, [
        el('h1', { text: art.title }),
        body,
      ])
    );
  }

  function actRow(a) {
    return el('li', { class: `row act${a.guide ? ' has-guide' : ''}` }, [
      el('span', { class: 'grow' }, [
        el('span', { class: 'name', text: a.title }),
        el('br'),
        el('span', { class: 'sub', text: a.desc }),
      ]),
      a.reputation ? el('span', { class: 'rep num', text: t('nw.standing', { n: a.reputation.toLocaleString(I18n.lang() === 'en' ? 'en-US' : 'pt-BR') }) }) : null,
      a.guide
        ? el('a', { class: 'guide-btn', href: `/nightwave.html?slug=${encodeURIComponent(a.guide.slug)}`, text: t('nw.howto') })
        : el('span', { class: 'kind-tag', text: t('nw.noguide') }),
    ]);
  }

  async function showBoard() {
    const data = await api('/api/nightwave');
    const daily = data.acts.filter((a) => a.isDaily);
    const weekly = data.acts.filter((a) => !a.isDaily && !a.isElite);
    const elite = data.acts.filter((a) => a.isElite);

    const sections = [
      el('section', { class: 'hero', style: 'padding-top:8px' }, [
        el('h1', { text: t('nw.boardTitle') }),
        el('p', { class: 'lead' }, [
          t('nw.boardLead'),
          data.season && data.season.expiry
            ? el('span', {}, [t('nw.seasonEndsPre'), el('span', { class: 'num', dataset: { expiry: data.season.expiry } }), '.'])
            : null,
        ]),
      ]),
    ];

    if (!data.available) {
      sections.push(el('div', { class: 'panel' }, [
        el('p', { class: 'empty', text: t('nw.none') }),
      ]));
    } else {
      const group = (title, acts) => (acts.length ? el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow', text: title }),
        el('ul', { class: 'rowlist' }, acts.map(actRow)),
      ]) : null);
      sections.push(group(t('nw.dailyActs'), daily));
      sections.push(group(t('nw.weeklyActs'), weekly));
      sections.push(group(t('nw.eliteActs'), elite));
    }

    sections.push(el('section', { class: 'panel' }, [
      el('p', { class: 'eyebrow' }, [`${t('nw.library')} `, el('span', { class: 'hint', text: t('nw.libraryHint') })]),
      el('div', { class: 'card-grid' }, (data.guides || []).map((g) =>
        el('a', { class: 'card', href: `/nightwave.html?slug=${encodeURIComponent(g.slug)}` }, [
          el('span', { class: 't', text: g.title }),
        ]))),
    ]));

    root.replaceChildren(...sections.filter(Boolean));
    startTimers();
  }

  const slug = qs('slug');
  (slug ? showGuide(slug) : showBoard()).catch((err) => {
    root.replaceChildren(el('div', { class: 'error-box', text: t('search.failed', { e: err.message }) }));
  });
})();
