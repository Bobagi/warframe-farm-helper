'use strict';

(() => {
  const { el, api, qs, attachSearch, resultRow } = App;

  const input = document.getElementById('q');
  const form = document.getElementById('search-form');
  const summary = document.getElementById('summary');
  const localPanel = document.getElementById('local-panel');
  const localList = document.getElementById('local-list');
  const webPanel = document.getElementById('web-panel');
  const webNote = document.getElementById('web-note');
  const webList = document.getElementById('web-list');
  const webMoreWrap = document.getElementById('web-more-wrap');
  const webMore = document.getElementById('web-more');

  attachSearch(input, document.getElementById('suggest'));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (q) location.href = `/buscar.html?q=${encodeURIComponent(q)}`;
  });

  function renderWeb(web) {
    webPanel.hidden = false;
    webList.replaceChildren();
    if (web.mode === 'cse') {
      webNote.textContent = web.cached
        ? 'Resultados da busca web (em cache) — fontes externas:'
        : 'Resultados da busca web — fontes externas:';
      if (!web.results.length) {
        webList.append(el('li', { class: 'empty', text: 'A busca web não retornou nada para esse termo.' }));
        return;
      }
      for (const r of web.results) {
        webList.append(el('li', { class: 'row web-result' }, [
          el('span', { class: 'grow' }, [
            el('a', { href: r.link, rel: 'noopener nofollow', target: '_blank' }, [
              el('span', { class: 'name', text: r.title || r.link }),
            ]),
            el('br'),
            el('span', { class: 'site', text: r.site || '' }),
            el('br'),
            el('span', { class: 'snippet', text: r.snippet || '' }),
          ]),
        ]));
      }
    } else {
      webNote.textContent = web.note || 'Busque direto nos sites confiáveis:';
      for (const l of web.links) {
        webList.append(el('li', {}, [
          el('a', { class: 'row row-link', href: l.url, rel: 'noopener', target: '_blank' }, [
            el('span', { class: 'grow name', text: l.label }),
            el('span', { class: 'kind-tag', text: 'externo' }),
          ]),
        ]));
      }
    }
  }

  async function run(q, forceWeb) {
    summary.textContent = 'Buscando…';
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}${forceWeb ? '&web=1' : ''}`);
      const n = data.results.length;
      summary.textContent = n
        ? `${n} resultado${n > 1 ? 's' : ''} local${n > 1 ? 'is' : ''} para "${data.query}"`
        : `Nada local para "${data.query}"`;
      localPanel.hidden = n === 0;
      localList.replaceChildren(...data.results.map(resultRow));
      if (data.web) {
        renderWeb(data.web);
        webMoreWrap.hidden = true;
      } else {
        webPanel.hidden = true;
        webMoreWrap.hidden = false;
      }
    } catch (err) {
      summary.textContent = '';
      localPanel.hidden = true;
      webPanel.hidden = true;
      document.querySelector('main .wrap').append(
        el('div', { class: 'error-box', text: `A busca falhou: ${err.message}` })
      );
    }
  }

  const initial = (qs('q') || '').trim();
  if (initial) {
    input.value = initial;
    document.title = `${initial} — Warframe Farm Helper`;
    run(initial, false);
    webMore.addEventListener('click', () => run(initial, true));
  } else {
    summary.textContent = 'Digite o que você quer farmar ou entender.';
    input.focus();
  }
})();
