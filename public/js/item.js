'use strict';

(() => {
  const { el, api, qs, fmtInt, fmtPct, tierBadge, rarityChip, statusBadge, startTimers, safeHref } = App;
  const { t, lang, nameFor, missionName, enemyName } = I18n;
  // locais de drop nas tabelas já vêm traduzidos do servidor; as fissuras ativas
  // vêm do worldstate (cache compartilhado) - traduz o node aqui, sem mutar o cache
  const placeName = (n) => (lang() === 'pt' ? Places.placePt(n) : n);
  const root = document.getElementById('content');

  function relicTable(comp) {
    const table = el('table', { class: 'relic-table' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: t('th.relic') }),
        el('th', { text: t('th.rarity') }),
        el('th', { text: 'Intact' }),
        el('th', { text: t('ref.Radiant') }),
        el('th', { text: t('th.status') }),
      ])]),
    ]);
    const tbody = el('tbody');
    for (const r of comp.relics) {
      tbody.append(el('tr', { class: r.vaulted ? 'is-vaulted' : '' }, [
        el('td', {}, [
          el('a', { href: App.relicUrl(r.relic) }, [tierBadge(r.tier), ` ${r.relic}`]),
          r.vaulted === false && r.relicDrops[0]
            ? el('div', { class: 'dim small', text: `${t('item.dropsAt')}: ${r.relicDrops[0].location} (${fmtPct(r.relicDrops[0].chance)})` })
            : null,
        ]),
        el('td', {}, [rarityChip(r.rarity)]),
        el('td', { class: 'num', text: fmtPct(r.chanceIntact) }),
        el('td', { class: 'num', text: fmtPct(r.chanceRadiant) }),
        el('td', {}, [
          statusBadge(r.vaulted !== false),
          r.varzia
            ? el('div', { class: 'badge badge-varzia', style: 'margin-top:4px', text: t('status.varzia') })
            : null,
          r.vaulted === false && r.activeFissures
            ? el('div', { class: 'small', style: 'color:var(--energy);margin-top:4px', text: `${r.activeFissures} ${t('item.fissNowShort', { t: r.tier })}` })
            : null,
        ]),
      ]));
    }
    table.append(tbody);
    return el('div', { class: 'table-scroll' }, [table]);
  }

  // Relíquias de um componente: as DISPONÍVEIS ficam visíveis (é o que dá para
  // farmar agora); as VAULTED (que costumam ser a maioria em primes antigos -
  // ex.: 37 de 39 no Braton Prime) entram num <details> colapsado para não
  // afogar a lista de componentes.
  // Relíquia vaulted que a Varzia vende agora é acionável hoje, então sobe para
  // o mesmo nível das disponíveis em vez de ficar enterrada no <details>.
  function relicsBlock(c) {
    const avail = c.relics.filter((r) => r.vaulted === false);
    const varzia = c.relics.filter((r) => r.vaulted !== false && r.varzia);
    const vaulted = c.relics.filter((r) => r.vaulted !== false && !r.varzia);
    const out = [];
    if (avail.length) out.push(relicTable({ relics: avail }));
    else if (!varzia.length) out.push(el('p', { class: 'muted small', text: t('item.allVaulted') }));
    if (varzia.length) {
      out.push(el('p', { class: 'muted small', text: t('item.varziaNote', { n: varzia.length }) }));
      out.push(relicTable({ relics: varzia }));
    }
    if (vaulted.length) {
      out.push(el('details', { class: 'relic-vault' }, [
        el('summary', { text: t('item.showVaulted', { n: vaulted.length }) }),
        relicTable({ relics: vaulted }),
      ]));
    }
    return out;
  }

  // fonte que é um inimigo/NPC vem com `wiki` do servidor → o nome vira link
  // (abre a página dele na wiki); locais de missão seguem texto puro
  const sourceRow = (s) => el('li', { class: 'row' }, [
    el('span', { class: 'grow small' }, [
      s.wiki
        ? el('a', { class: 'name src-wiki', href: safeHref(s.wiki), target: '_blank', rel: 'noopener', text: s.location })
        : el('span', { class: 'name', text: s.location }),
    ]),
    s.rarity ? rarityChip(s.rarity) : null,
    el('span', { class: 'num small', text: fmtPct(s.chance) }),
  ]);

  // lista de "onde dropa": mostra os melhores SHOW e colapsa o resto num
  // <details> (listas de drop costumam ser longas - ex.: recursos/peças comuns).
  const SHOW = 4;
  function sourcesList(sources, label) {
    if (!sources.length) return null;
    const head = sources.slice(0, SHOW);
    const rest = sources.slice(SHOW);
    const out = [
      label ? el('h3', { text: label }) : null,
      el('ul', { class: 'rowlist' }, head.map(sourceRow)),
    ];
    if (rest.length) out.push(el('details', { class: 'relic-vault' }, [
      el('summary', { text: t('item.showMoreSources', { n: rest.length }) }),
      el('ul', { class: 'rowlist' }, rest.map(sourceRow)),
    ]));
    return el('div', {}, out);
  }

  function marketPanel(item) {
    const slugs = [];
    if (item.setMarketSlug) slugs.push({ slug: item.setMarketSlug, label: t('item.fullSet') });
    for (const c of item.components) {
      if (c.marketSlug && c.relics.length) slugs.push({ slug: c.marketSlug, label: c.fullName });
    }
    if (!slugs.length) return null;
    const body = el('div', { class: 'muted small', text: t('item.marketLoading') });
    const panel = el('section', { class: 'panel panel-quiet' }, [
      el('p', { class: 'eyebrow' }, [`${t('item.market')} `, el('span', { class: 'hint', text: t('item.marketHint') })]),
      body,
    ]);
    Promise.all(slugs.slice(0, 8).map(async ({ slug, label }) => {
      try {
        const d = await api(`/api/market/${encodeURIComponent(slug)}`);
        if (d && !d.error && !d.notFound && d.minSell != null) return { label, d };
      } catch { /* item sem mercado */ }
      return null;
    })).then((rows) => {
      const ok = rows.filter(Boolean);
      if (!ok.length) { panel.remove(); return; }
      body.replaceChildren(el('ul', { class: 'rowlist' }, ok.map(({ label, d }) => el('li', { class: 'row' }, [
        el('span', { class: 'grow name small', text: label }),
        el('a', { class: 'small', href: safeHref(d.url), target: '_blank', rel: 'noopener', text: t('item.marketOrders') }),
        el('span', { class: 'num', style: 'color:var(--orokin-bright);font-weight:700', text: `~${d.minSell} pl` }),
      ]))));
    });
    return panel;
  }

  function render(item) {
    document.title = `${nameFor(item)} - Warframe Farm Helper`;
    const frag = [];

    frag.push(el('p', { class: 'small', style: 'margin:0 0 12px' }, [
      el('a', {
        href: '/buscar', text: t('item.back'),
        onclick: (ev) => { if (history.length > 1) { ev.preventDefault(); history.back(); } },
      }),
    ]));

    frag.push(el('section', { class: 'panel' }, [
      el('div', { class: 'item-hero' }, [
        item.image ? el('img', { class: 'art', src: item.image, alt: nameFor(item) }) : null,
        el('div', { class: 'meta' }, [
          el('h1', { text: nameFor(item) }),
          lang() === 'en' && item.namePt && item.namePt !== item.name
            ? el('p', { class: 'muted', style: 'margin:0', text: item.namePt }) : null,
          lang() === 'pt' && item.namePt && item.namePt !== item.name
            ? el('p', { class: 'muted', style: 'margin:0', text: item.name }) : null,
          el('div', { class: 'badges-line' }, [
            el('span', { class: 'badge', text: item.isQuest ? t('quest.title') : (item.type || item.category) }),
            item.masteryReq ? el('span', { class: 'badge badge-gold', text: t('tag.mrShort', { n: item.masteryReq }) }) : null,
            item.vaulted != null ? statusBadge(item.vaulted) : null,
            item.tradable ? el('span', { class: 'badge', text: t('tag.tradable') }) : null,
          ]),
          item.description ? el('p', { class: 'desc', text: item.description }) : null,
          item.wikiUrl ? el('p', { style: 'margin:10px 0 0' }, [
            el('a', { class: 'btn-line', href: safeHref(item.wikiUrl), target: '_blank', rel: 'noopener', text: t('item.wiki') }),
          ]) : null,
        ]),
      ]),
    ]));

    if (item.isQuest) {
      const qi = item.questInfo;
      const has = qi && (qi.requirement.length || qi.reward.length || qi.previousQuest || qi.nextQuest);
      const body = [];
      if (has) {
        if (qi.requirement.length) body.push(el('div', { class: 'quest-block' }, [
          el('h3', { text: t('quest.requirements') }),
          el('ul', { class: 'quest-list' }, qi.requirement.map((r) => el('li', { text: r }))),
        ]));
        if (qi.reward.length) body.push(el('div', { class: 'quest-block' }, [
          el('h3', { text: t('quest.rewards') }),
          el('ul', { class: 'quest-rewards' }, qi.reward.map((r) => el('li', { class: 'quest-reward' }, [
            r.image
              ? el('img', { class: 'qr-img', src: r.image, alt: '', loading: 'lazy' })
              : el('span', { class: 'qr-img qr-noimg', 'aria-hidden': 'true' }),
            r.wiki
              ? el('a', { class: 'qr-link', href: safeHref(r.wiki), target: '_blank', rel: 'noopener', text: r.label })
              : el('span', { text: r.label }),
          ]))),
        ]));
        if (qi.previousQuest || qi.nextQuest) body.push(el('p', { class: 'quest-chain small muted' }, [
          qi.previousQuest ? `${t('quest.prev')}: ${qi.previousQuest}` : null,
          qi.previousQuest && qi.nextQuest ? '  ·  ' : null,
          qi.nextQuest ? `${t('quest.next')}: ${qi.nextQuest}` : null,
        ]));
        body.push(el('p', { class: 'small muted', style: 'margin:12px 0 0' }, [
          `${t('quest.source')} `,
          item.wikiUrl ? el('a', { href: safeHref(item.wikiUrl), target: '_blank', rel: 'noopener', text: t('item.wikiInline') }) : t('item.wikiInline'),
          '.',
        ]));
      } else {
        body.push(el('p', { class: 'muted small', text: t('quest.note') }));
        if (item.wikiUrl) body.push(el('p', { style: 'margin:10px 0 0' }, [
          el('a', { class: 'btn-line', href: safeHref(item.wikiUrl), target: '_blank', rel: 'noopener', text: t('quest.wikiCta') }),
        ]));
      }
      frag.push(el('section', { class: 'panel' }, [el('p', { class: 'eyebrow', text: t('quest.title') }), ...body]));
    }

    if (item.usedToBuild && item.usedToBuild.length) {
      frag.push(el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow' }, [`${t('item.usedIn')} `, el('span', { class: 'hint', text: t('item.usedInHint') })]),
        el('ul', { class: 'rowlist' }, item.usedToBuild.map((p) => el('li', { class: 'row' }, [
          el('a', { class: 'row-link result-item grow', href: safeHref(p.url) }, [
            p.image ? el('img', { src: p.image, alt: '', loading: 'lazy' }) : null,
            el('span', { class: 'name', text: nameFor(p) }),
          ]),
          p.itemCount > 1 ? el('span', { class: 'count', text: `×${p.itemCount}` }) : null,
          p.vaulted != null ? statusBadge(p.vaulted) : null,
        ]))),
      ]));
    }

    if (item.crafting) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow', text: t('item.forge') }),
        el('div', { class: 'stat-grid' }, [
          item.crafting.credits != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: t('item.credits') }),
            el('div', { class: 'v num', text: fmtInt(item.crafting.credits) }),
          ]) : null,
          item.crafting.time ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: t('item.time') }),
            el('div', { class: 'v', text: item.crafting.time }),
          ]) : null,
          item.crafting.rushPlatinum != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: t('item.rush') }),
            el('div', { class: 'v num' }, [`${item.crafting.rushPlatinum} `, el('small', { text: t('item.platina') })]),
          ]) : null,
          item.masteryReq != null ? el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: t('item.mrMin') }),
            el('div', { class: 'v num', text: `MR ${item.masteryReq}` }),
          ]) : null,
        ]),
      ]));
    }

    if (item.steps && item.steps.length && !item.isQuest) {
      frag.push(el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow', text: t('item.steps') }),
        el('ol', { class: 'steps' }, item.steps.map((s) => el('li', { text: s }))),
      ]));
    }

    if (item.components.length) {
      const compSection = el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow' }, [`${t('item.components')} `, el('span', { class: 'hint', text: t('item.componentsHint') })]),
      ]);
      for (const c of item.components) {
        const block = el('div', { class: 'comp-block', id: c.anchor }, [
          el('div', { class: 'comp-head' }, [
            c.image ? el('img', { src: c.image, alt: '', loading: 'lazy' }) : null,
            c.wikiUrl
              ? el('a', { class: 'comp-name', href: safeHref(c.wikiUrl), target: '_blank', rel: 'noopener', text: c.fullName })
              : el('span', { class: 'comp-name', text: c.fullName }),
            c.itemCount > 1 ? el('span', { class: 'count', text: `×${c.itemCount}` }) : null,
            c.ducats ? el('span', { class: 'badge badge-gold', text: t('tag.ducats', { n: c.ducats }) }) : null,
            statusBadge(!c.available),
          ]),
        ]);
        if (c.relics.length) for (const node of relicsBlock(c)) block.append(node);
        const others = sourcesList(c.otherSources, c.relics.length ? t('item.otherSources') : null);
        if (others) block.append(others);
        if (!c.relics.length && !c.otherSources.length) {
          if (c.resourceDrops && c.resourceDrops.length) {
            // recurso sem tabela no dataset, mas com drops via API de drops
            // (sourcesList já colapsa o excedente)
            block.append(sourcesList(c.resourceDrops, t('item.whereDrops')));
          } else {
            block.append(el('p', { class: 'muted small' }, [
              t('item.noSourcePre'),
              c.wikiUrl
                ? el('a', { href: safeHref(c.wikiUrl), target: '_blank', rel: 'noopener', text: t('item.wikiInline') })
                : t('item.wikiInline'),
              t('item.noSourcePost'),
            ]));
          }
        }
        compSection.append(block);
      }
      frag.push(compSection);
    } else if (item.sources.other.length || item.sources.relics.length) {
      frag.push(el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow', text: t('item.whereDrops') }),
        sourcesList(item.sources.other, null) || el('p', { class: 'empty', text: '-' }),
      ]));
    }

    const tiers = Object.keys(item.fissures || {});
    const activeTiers = tiers.filter((t2) => item.fissures[t2].length);
    if (activeTiers.length) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow' }, [`${t('item.fissNow')} `, el('span', { class: 'hint', text: t('item.fissHint') })]),
        el('ul', { class: 'rowlist' }, activeTiers.flatMap((tier) => item.fissures[tier].slice(0, 4).map((f) => el('li', { class: 'row' }, [
          tierBadge(f.tier),
          el('span', { class: 'grow' }, [
            el('span', { class: 'name', text: missionName(f.missionType) }),
            el('br'),
            el('span', { class: 'sub', text: `${placeName(f.node)} · ${enemyName(f.enemy)}${f.isHard ? ' · Steel Path' : ''}${f.isStorm ? ' · Railjack' : ''}` }),
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

  // URL bonita (/item/<slug>): o server injeta o uniqueName em data-item-u;
  // ?u= segue como fallback das URLs legadas
  const u = document.body.dataset.itemU || qs('u');
  if (!u) {
    root.replaceChildren(el('div', { class: 'error-box', text: t('item.notItem') }));
  } else {
    api(`/api/item?u=${encodeURIComponent(u)}&lang=${lang()}`)
      .then(render)
      .catch((err) => root.replaceChildren(el('div', { class: 'error-box', text: t('item.loadFail', { e: err.message }) })));
  }
})();
