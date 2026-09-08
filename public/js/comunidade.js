'use strict';

/**
 * Página Comunidade: formulário de mensagem + mural público. Render 100% via
 * el()/textContent - o conteúdo do mural é INPUT DE USUÁRIO ANÔNIMO, nunca
 * passa por innerHTML. O link "página relacionada" passa pelo safeHref
 * (caminho interno já validado no servidor; aqui é a segunda camada).
 */

(() => {
  const { el, api, safeHref, fmtInt } = App;
  const { t } = I18n;

  const form = document.getElementById('fb-form');
  const list = document.getElementById('fb-list');
  const empty = document.getElementById('fb-empty');
  const count = document.getElementById('fb-count');
  const moreWrap = document.getElementById('fb-more-wrap');
  const moreBtn = document.getElementById('fb-more');
  const status = document.getElementById('fb-status');
  const sendBtn = document.getElementById('fb-send');

  let oldestId = null;
  let total = 0;

  // chegou pelo convite de uma página ("algo errado aqui?"): pré-preenche a
  // página relacionada. Vai só para o VALUE do input (nunca HTML) e o servidor
  // revalida no POST - ?page= hostil não passa daqui.
  const fromPage = App.qs('page');
  if (fromPage) document.getElementById('fb-page').value = fromPage.slice(0, 160);

  const KIND_CLASS = { suggestion: 'sug', guide: 'guide', bug: 'bug', comment: 'chat' };

  function postCard(p) {
    const msgNodes = [];
    String(p.message).split('\n').forEach((line, i) => {
      if (i > 0) msgNodes.push(el('br'));
      if (line) msgNodes.push(line);
    });
    const pageHref = p.page ? safeHref(p.page) : null;
    return el('article', { class: 'fb-post' }, [
      el('div', { class: 'fb-meta' }, [
        el('span', { class: `chip fb-kind fb-kind-${KIND_CLASS[p.kind] || 'chat'}`, text: t(`comm.kind.${p.kind}`) }),
        el('span', { class: 'fb-nick', text: p.nick || t('comm.anon') }),
        el('span', { class: 'fb-when', text: I18n.fmtWhen(p.createdAt) }),
      ]),
      el('p', { class: 'fb-msg' }, msgNodes),
      pageHref ? el('p', { class: 'fb-page' }, [el('a', { href: pageHref, text: pageHref })]) : null,
      p.reply ? el('div', { class: 'fb-reply' }, [
        el('span', { class: 'fb-reply-tag', text: t('comm.reply') }),
        el('p', { class: 'fb-msg', text: p.reply }),
      ]) : null,
    ]);
  }

  function renderBatch(posts, { prepend = false } = {}) {
    const nodes = posts.map(postCard);
    if (prepend) list.prepend(...nodes);
    else list.append(...nodes);
    if (posts.length && !prepend) oldestId = posts[posts.length - 1].id;
    empty.hidden = list.children.length > 0;
  }

  function setCount(n) {
    total = n;
    count.textContent = n === 1 ? t('comm.countOne') : t('comm.count', { n: fmtInt(n) });
  }

  async function load(before) {
    try {
      const res = await api(`/api/feedback${before ? `?before=${before}` : ''}`);
      renderBatch(res.posts);
      setCount(res.total);
      moreWrap.hidden = !res.hasMore;
    } catch {
      empty.hidden = false;
      empty.textContent = t('comm.loadErr');
    }
  }

  moreBtn.addEventListener('click', () => { if (oldestId) load(oldestId); });

  const ERR_KEY = {
    short: 'comm.errShort', long: 'comm.errLong', rate: 'comm.errRate', dup: 'comm.errDup',
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const message = document.getElementById('fb-msg').value.trim();
    if (message.length < 5) {
      status.textContent = t('comm.errShort');
      status.className = 'fb-status err';
      return;
    }
    sendBtn.disabled = true;
    status.textContent = '…';
    status.className = 'fb-status';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kind: document.getElementById('fb-kind').value,
          nick: document.getElementById('fb-nick').value,
          message,
          page: document.getElementById('fb-page').value,
          lang: I18n.lang(),
          website: document.getElementById('fb-website').value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        status.textContent = t(ERR_KEY[data.code] || 'comm.errGeneric');
        status.className = 'fb-status err';
        return;
      }
      status.textContent = t('comm.ok');
      status.className = 'fb-status ok';
      document.getElementById('fb-msg').value = '';
      document.getElementById('fb-page').value = '';
      if (data.post) {
        renderBatch([data.post], { prepend: true });
        setCount(total + 1);
      }
    } catch {
      status.textContent = t('comm.errGeneric');
      status.className = 'fb-status err';
    } finally {
      sendBtn.disabled = false;
    }
  });

  load();
})();
