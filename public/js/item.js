'use strict';

(() => {
  const { el, api, qs, fmtInt, fmtPct, tierBadge, rarityChip, statusBadge, startTimers } = App;
  const root = document.getElementById('content');

  function relicTable(comp) {
    const table = el('table', { class: 'relic-table' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Relíquia' }),
        el('th', { text: 'Raridade' }),
        el('th', { text: 'Intact' }),
        el('th', { text: 'Radiante' }),
        el('th', { text: 'Status' }),
      ])]),
    ]);
    const tbody = el('tbody');
    for (const r of comp.relics) {
      tbody.append(el('tr', { class: r.vaulted ? 'is-vaulted' : '' }, [
        el('td', {}, [
          el('a', { href: `/relic.html?n=${encodeURIComponent(r.relic)}` }, [tierBadge(r.tier), ` ${r.relic}`]),
          r.vaulted === false && r.relicDrops[0]
            ? el('div', { class: 'dim small', text: `dropa em: ${r.relicDrops[0].location} (${fmtPct(r.relicDrops[0].chance)})` })
            : null,
        ]),
        el('td', {}, [rarityChip(r.rarity, r.rarityPt)]),
        el('td', { class: 'num', text: fmtPct(r.chanceIntact) }),
        el('td', { class: 'num', text: fmtPct(r.chanceRadiant) }),
        el('td', {}, [
          statusBadge(r.vaulted !== false),
          r.vaulted === false && r.activeFissures
            ? el('div', { class: 'small', style: 'color:var(--energy);margin-top:4px', text: `${r.activeFissures} fissura${r.activeFissures > 1 ? 's' : ''} ${r.tier} agora` })
            : null,
        ]),
      ]));
    }
    table.append(tbody);
    return el('div', { class: 'table-scroll' }, [table]);
  }

  function sourcesList(sources, label) {
    if (!sources.length) return null;
    return el('div', {}, [
      label ? el('h3', { text: label }) : null,
      el('ul', { class: 'rowlist' }, sources.map((s) => el('li', { class: 'row' }, [
        el('span', { class: 'grow name small', text: s.location }),
        s.rarity ? rarityChip(s.rarity) : null,
        el('span', { class: 'num small', text: fmtPct(s.chance) }),
      ]))),
    ]);
  }

  function marketPanel(item) {
    const slugs = [];
    if (item.setMarketSlug) slugs.push({ slug: item.setMarketSlug, label: 'Set completo' });
    for (const c of item.components) {
      if (c.marketSlug && c.relics.length) slugs.push({ slug: c.marketSlug, label: c.fullName });
    }
    if (!slugs.length) return null;
    const body = el('div', { class: 'muted small', text: 'Consultando preços no warframe.market…' });
    const panel = el('section', { class: 'panel panel-quiet' }, [
      el('p', { class: 'eyebrow' }, ['Ou compre de outro jogador ', el('span', { class: 'hint', text: 'warframe.market · menor preço de venda' })]),
      body,
    ]);
    Promise.all(slugs.slice(0, 8).map(async ({ slug, label }) => {
      try {
        const d = await api(`/api/market/${encodeURIComponent(slug)}`);
        if (d && !d.error && !d.notFound && d.minSell != null) return { label, d };
      } catch { /* ignora item sem mercado */ }
      return null;
    })).then((rows) => {
      const ok = rows.filter(Boolean);
      if (!ok.length) { panel.remove(); return; }
      body.replaceChildren(el('ul', { class: 'rowlist' }, ok.map(({ label, d }) => el('li', { class: 'row' }, [
        el('span', { class: 'grow name small', text: label }),
        el('a', { class: 'small', href: d.url, target: '_blank', rel: 'noopener', text: 'ver ordens' }),
        el('span', { class: 'num', style: 'color:var(--orokin-bright);font-weight:700', text: `~${d.minSell} pl` }),
      ]))));
    });
    return panel;
  }

  function render(item) {
    document.title = `${item.name} — Warframe Farm Helper`;
    const frag = [];

    frag.push(el('p', { class: 'small', style: 'margin:0 0 12px' }, [
      el('a', {
        href: '/buscar.html',
        text: '← voltar',
        onclick: (ev) => { if (history.length > 1) { ev.preventDefault(); history.back(); } },
      }),
    ]));

    // hero
    frag.push(el('section', { class: 'panel' }, [
      el('div', { class: 'item-hero' }, [
        item.image ? el('img', { class: 'art', src: item.image, alt: item.name }) : null,
        el('div', { class: 'meta' }, [
          el('h1', { text: item.name }),
          item.namePt && item.namePt !== item.name ? el('p', { class: 'muted', style: 'margin:0', text: item.namePt }) : null,
          el('div', { class: 'badges-line' }, [
            el('span', { class: 'badge', text: item.type || item.category }),
            item.masteryReq ? el('span', { class: 'badge badge-gold', text: `MR ${item.masteryReq}` }) : null,
            item.vaulted != null ? statusBadge(item.vaulted) : null,
            item.tradable ? el('span', { class: 'badge', text: 'Trocável' }) : null,
          ]),
          item.description ? el('p', { class: 'desc', text: item.description }) : null,
          item.wikiUrl ? el('p', { style: 'margin:10px 0 0' }, [
            el('a', { class: 'btn-line', href: item.wikiUrl, target: '_blank', rel: 'noopener', text: 'Página na wiki' }),
          ]) : null,
        ]),
      ]),
    ]));

    // forja
    if (item.crafting) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow', text: 'Forja (Foundry)' }),
        el('div', { class: 'stat-grid' }, [
          item.crafting.credits != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: 'Créditos' }),
            el('div', { class: 'v num', text: fmtInt(item.crafting.credits) }),
          ]) : null,
          item.crafting.time ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: 'Tempo' }),
            el('div', { class: 'v', text: item.crafting.time }),
          ]) : null,
          item.crafting.rushPlatinum != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: 'Apressar' }),
            el('div', { class: 'v num' }, [`${item.crafting.rushPlatinum} `, el('small', { text: 'platina' })]),
          ]) : null,
          item.masteryReq != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: 'Maestria mínima' }),
            el('div', { class: 'v num', text: `MR ${item.masteryReq}` }),
          ]) : null,
        ]),
      ]));
    }

    // passo a passo
    if (item.steps && item.steps.length) {
      frag.push(el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow', text: 'Como conseguir — passo a passo' }),
        el('ol', { class: 'steps' }, item.steps.map((s) => el('li', { text: s }))),
      ]));
    }

    // componentes
    if (item.components.length) {
      const compSection = el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow' }, ['Componentes ', el('span', { class: 'hint', text: 'relíquias disponíveis primeiro' })]),
      ]);
      for (const c of item.components) {
        const block = el('div', { class: 'comp-block', id: c.anchor }, [
          el('div', { class: 'comp-head' }, [
            c.image ? el('img', { src: c.image, alt: '', loading: 'lazy' }) : null,
            el('span', { class: 'comp-name', text: c.fullName }),
            c.itemCount > 1 ? el('span', { class: 'count', text: `×${c.itemCount}` }) : null,
            c.ducats ? el('span', { class: 'badge badge-gold', text: `${c.ducats} ducats` }) : null,
            statusBadge(!c.available),
          ]),
        ]);
        if (c.relics.length) block.append(relicTable(c));
        const others = sourcesList(c.otherSources, c.relics.length ? 'Outras fontes' : null);
        if (others) block.append(others);
        if (!c.relics.length && !c.otherSources.length) {
          block.append(el('p', { class: 'muted small', text: 'Sem fonte de drop nas tabelas oficiais (recurso comum, quest, loja ou pesquisa de clã — veja a wiki).' }));
        }
        compSection.append(block);
      }
      frag.push(compSection);
    } else if (item.sources.other.length || item.sources.relics.length) {
      frag.push(el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow', text: 'Onde dropa' }),
        sourcesList(item.sources.other, null) || el('p', { class: 'empty', text: '—' }),
      ]));
    }

    // fissuras relevantes
    const tiers = Object.keys(item.fissures || {});
    const activeTiers = tiers.filter((t) => item.fissures[t].length);
    if (activeTiers.length) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow' }, ['Fissuras ativas para farmar agora ', el('span', { class: 'hint', text: 'tiers das relíquias disponíveis' })]),
        el('ul', { class: 'rowlist' }, activeTiers.flatMap((t) => item.fissures[t].slice(0, 4).map((f) => el('li', { class: 'row' }, [
          tierBadge(f.tier),
          el('span', { class: 'grow' }, [
            el('span', { class: 'name', text: f.missionType }),
            el('br'),
            el('span', { class: 'sub', text: `${f.node} · ${f.enemy}${f.isHard ? ' · Steel Path' : ''}${f.isStorm ? ' · Railjack' : ''}` }),
          ]),
          el('span', { class: 'time num', dataset: { expiry: f.expiry } }),
        ])))),
      ]));
    }

    const market = marketPanel(item);
    if (market) frag.push(market);

    root.replaceChildren(...frag);
    startTimers();
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  }

  const u = qs('u');
  if (!u) {
    root.replaceChildren(el('div', { class: 'error-box', text: 'Item não especificado.' }));
  } else {
    api(`/api/item?u=${encodeURIComponent(u)}`)
      .then(render)
      .catch((err) => root.replaceChildren(el('div', { class: 'error-box', text: `Não deu para carregar o item: ${err.message}` })));
  }
})();
