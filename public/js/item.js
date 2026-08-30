'use strict';

(() => {
  const { el, api, qs, fmtInt, fmtPct, tierBadge, rarityChip, statusBadge, startTimers, safeHref } = App;
  const { t, lang, nameFor, missionName, enemyName, typeName, relicName } = I18n;
  // nome do componente: o servidor manda a versão traduzida em fullNameZh/
  // fullNamePt ("Bronco Prime Cano"); sem tradução cai no nome canônico EN
  const compName = (c) => ((lang() === 'zh' && c.fullNameZh) ? c.fullNameZh
    : (lang() === 'pt' && c.fullNamePt) ? c.fullNamePt : c.fullName);
  // selo de tipo: o dataset devolve o tipo cru em inglês ("Resource", "Rifle").
  // As categorias que JÁ têm rótulo traduzido no dicionário usam ele; o resto
  // (tipos de arma) fica no cru, que é como a comunidade se refere mesmo.
  const CATEGORY_LABEL = {
    Resources: 'kind.resource', Mods: 'kind.mod', Fish: 'kind.fish',
    Gear: 'kind.gear', Quests: 'kind.quest', Arcanes: 'kind.arcane',
  };
  const typeLabel = (item) => (CATEGORY_LABEL[item.category]
    ? t(CATEGORY_LABEL[item.category]) : typeName(item.type || item.category));
  // locais de drop nas tabelas já vêm traduzidos do servidor; as fissuras ativas
  // vêm do worldstate (cache compartilhado) - traduz o node aqui, sem mutar o cache
  const placeName = (n) => (lang() === 'pt' || lang() === 'zh' ? Places.placeIn(n, lang()) : n);
  const root = document.getElementById('content');

  function relicTable(comp) {
    const table = el('table', { class: 'relic-table' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: t('th.relic') }),
        el('th', { text: t('th.rarity') }),
        el('th', { text: t('ref.Intact') }),
        el('th', { text: t('ref.Radiant') }),
        el('th', { text: t('th.status') }),
      ])]),
    ]);
    const tbody = el('tbody');
    for (const r of comp.relics) {
      tbody.append(el('tr', { class: r.vaulted ? 'is-vaulted' : '' }, [
        el('td', {}, [
          el('a', { href: App.relicUrl(r.relic) }, [tierBadge(r.tier), ` ${relicName(r.relic)}`]),
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
            ? el('div', { class: 'small', style: 'color:var(--energy);margin-top:4px', text: `${r.activeFissures} ${t('item.fissNowShort', { t: I18n.tierName(r.tier) })}` })
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
    // Contrato de mundo aberto (Fortuna/Eudico etc.): o local cru da DE não
    // deixa claro que é preciso ir ao hub e falar com o NPC - o passo a passo
    // (item.steps) já explica isso em prosa; aqui é só um lembrete rápido.
    s.bounty ? el('span', { class: 'chip-hub', text: t('item.bountyHub', { hub: s.bounty.hub }) }) : null,
    s.rarity ? rarityChip(s.rarity) : null,
    // `qty` (quantidade por drop, ex. 750x num baú) só vem de fontes de
    // recurso resolvidas via server/drops.js - sem ela a % sozinha escondia
    // que um baú "fraco" de 12,65% pode render muito mais por partida
    el('span', { class: 'num small', text: s.qty > 1 ? `${fmtPct(s.chance)} · ${fmtInt(s.qty)}x` : fmtPct(s.chance) }),
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
      if (c.marketSlug && c.relics.length) slugs.push({ slug: c.marketSlug, label: compName(c) });
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
        el('span', { class: 'num', style: 'color:var(--orokin-bright);font-weight:700', text: `~${d.minSell} ${lang() === 'zh' ? t('cur.Platinum') : 'pl'}` }),
      ]))));
    });
    return panel;
  }

  // ------------------------------------------------------------------
  // "Como conseguir": as vias que NÃO são drop - pesquisa no Dojo do clã,
  // vendedores/sindicatos e Mercado. Vem dos módulos de dados da wiki (ver
  // server/wikiacq.js); tudo aqui é dado externo, então nome vai por
  // textContent e href passa por safeHref.
  // ------------------------------------------------------------------

  /**
   * Forma plural de "dia". PT/EN/ES separam só 1 do resto; o RUSSO usa três
   * formas (1 день / 2-4 дня / 5+ дней) e uma string única daria "3 дней".
   */
  function dayWord(n) {
    if (lang() !== 'ru') return t(n === 1 ? 'unit.day.one' : 'unit.day.few');
    const d10 = n % 10; const d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return t('unit.day.one');
    if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return t('unit.day.few');
    return t('unit.day.many');
  }

  /** "3 dias" / "12 h" a partir dos segundos que o servidor manda. */
  function fmtDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return null;
    const h = sec / 3600;
    if (h >= 48) { const d = Math.round(h / 24); return `${d} ${dayWord(d)}`; }
    if (h >= 1) return `${Math.round(h)} h`;
    return `${Math.round(sec / 60)} min`;
  }

  // moeda de jogo: as 3 universais têm tradução; o resto é nome próprio de item
  // (Vitus Essence, Pathos Clamp…) e fica em inglês, como o resto dos nomes.
  const currencyLabel = (c) => (c ? (I18n.has(`cur.${c}`) ? t(`cur.${c}`) : c) : '');

  const statCell = (k, v) => (v == null ? null : el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v num' }, [].concat(v)),
  ]));

  /** material da pesquisa: arte + quantidade + link para a página dele */
  const materialRow = (m) => el('li', { class: 'row' }, [
    m.url
      ? el('a', { class: 'row-link result-item grow', href: safeHref(m.url) }, [
        m.image ? el('img', { src: m.image, alt: '', loading: 'lazy' }) : null,
        el('span', { class: 'name', text: nameFor(m) }),
      ])
      : el('span', { class: 'grow name', text: m.name }),
    el('span', { class: 'count num', text: `×${fmtInt(m.count)}` }),
  ]);

  const vendorRow = (v) => el('li', { class: 'row' }, [
    el('span', { class: 'grow' }, [
      v.wiki
        ? el('a', { class: 'name src-wiki', href: safeHref(v.wiki), target: '_blank', rel: 'noopener', text: v.vendor })
        : el('span', { class: 'name', text: v.vendor }),
      v.rank ? el('span', { class: 'sub', text: t('acq.rank', { n: v.rank }) }) : null,
    ]),
    v.qty > 1 ? el('span', { class: 'badge', text: t('acq.perBuy', { n: fmtInt(v.qty) }) }) : null,
    el('span', { class: 'num price', text: `${fmtInt(v.cost)} ${currencyLabel(v.currency)}`.trim() }),
  ]);

  // nome do laboratório no idioma ativo (só o chinês tem tabela; ver acquisition.js)
  const labName = (r) => ((lang() === 'zh' && r.labZh) ? r.labZh : r.lab);

  function researchBlock(r) {
    const cost = fmtDuration(r.timeSec);
    return el('div', { class: 'acq-block' }, [
      el('h3', {}, [
        t('acq.dojo'),
        r.lab
          ? el('a', {
            class: 'badge badge-lab', href: safeHref(r.labWiki),
            target: '_blank', rel: 'noopener', text: labName(r),
          })
          : null,
      ]),
      el('div', { class: 'stat-grid' }, [
        statCell(t('acq.researchCost'), r.credits != null ? fmtInt(r.credits) : null),
        statCell(t('acq.researchTime'), cost),
        statCell(t('acq.affinity'), r.affinity != null ? fmtInt(r.affinity) : null),
      ]),
      r.resources.length ? el('p', { class: 'eyebrow eyebrow-sm', text: t('acq.materials') }) : null,
      r.resources.length ? el('ul', { class: 'rowlist' }, r.resources.map(materialRow)) : null,
      r.prereq ? el('p', { class: 'small muted' }, [
        `${t('acq.prereq')}: `,
        r.prereqUrl ? el('a', { href: safeHref(r.prereqUrl), text: r.prereq }) : el('span', { text: r.prereq }),
      ]) : null,
      el('p', { class: 'small muted', text: t('acq.dojoNote') }),
    ]);
  }

  function acquisitionPanel(item) {
    const a = item.acquisition;
    if (!a) return null;
    const body = [];
    if (a.research) body.push(researchBlock(a.research));
    if (a.vendors.length) body.push(el('div', { class: 'acq-block' }, [
      el('h3', { text: t('acq.buy') }),
      el('ul', { class: 'rowlist' }, a.vendors.map(vendorRow)),
    ]));
    if (a.market) body.push(el('div', { class: 'acq-block' }, [
      el('h3', { text: t('acq.market') }),
      el('div', { class: 'stat-grid' }, [
        a.market.platinum != null ? statCell(t('acq.marketItem'), [
          `${fmtInt(a.market.platinum)} `, el('small', { text: t('item.platina') }),
        ]) : null,
        a.market.blueprintCredits != null
          ? statCell(t('acq.marketBp'), [
            `${fmtInt(a.market.blueprintCredits)} `, el('small', { text: t('cur.Credits') }),
          ]) : null,
      ]),
    ]));
    if (!body.length) return null;
    body.push(el('p', { class: 'small dim', text: t('acq.source') }));
    return el('section', { class: 'panel panel-acq' }, [
      el('p', { class: 'eyebrow' }, [`${t('acq.title')} `, el('span', { class: 'hint', text: t('acq.hint') })]),
      ...body,
    ]);
  }

  /**
   * Resumo de UMA linha para o componente (o card cheio é do item). O
   * componente "Blueprint" é o projeto do próprio item: aponta para a via de
   * cima em vez de repetir a tabela inteira.
   */
  function compAcquisition(c) {
    const a = c.acquisition;
    if (!a) return null;
    const parts = [];
    // sem o custo da pesquisa aqui de propósito: ele é do CLÃ e uma vez só, e
    // numa coluna de preço passaria a impressão de ser o preço do projeto
    if (a.research) {
      parts.push(el('li', { class: 'row' }, [
        el('span', { class: 'grow small', text: t('acq.compDojo', { lab: labName(a.research) }) }),
      ]));
    }
    for (const v of a.vendors.slice(0, 4)) parts.push(vendorRow(v));
    if (a.market && a.market.blueprintCredits != null) {
      parts.push(el('li', { class: 'row' }, [
        el('span', { class: 'grow small', text: t('acq.marketBp') }),
        el('span', { class: 'num small', text: `${fmtInt(a.market.blueprintCredits)} ${t('cur.Credits')}` }),
      ]));
    }
    if (!parts.length) return null;
    return el('div', { class: 'comp-acq' }, [
      c.isBlueprint ? el('p', { class: 'small muted', style: 'margin:0 0 4px', text: t('acq.bpFrom') }) : null,
      el('ul', { class: 'rowlist' }, parts),
    ]);
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
            el('span', { class: 'badge', text: item.isQuest ? t('quest.title') : typeLabel(item) }),
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

    const acqPanel = acquisitionPanel(item);
    if (acqPanel) frag.push(acqPanel);

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
            el('div', { class: 'v num', text: t('tag.mrShort', { n: item.masteryReq }) }),
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
              ? el('a', { class: 'comp-name', href: safeHref(c.wikiUrl), target: '_blank', rel: 'noopener', text: compName(c) })
              : el('span', { class: 'comp-name', text: compName(c) }),
            c.itemCount > 1 ? el('span', { class: 'count', text: `×${c.itemCount}` }) : null,
            c.ducats ? el('span', { class: 'badge badge-gold', text: t('tag.ducats', { n: c.ducats }) }) : null,
            statusBadge(!c.available),
          ]),
        ]);
        if (c.relics.length) for (const node of relicsBlock(c)) block.append(node);
        const others = sourcesList(c.otherSources, c.relics.length ? t('item.otherSources') : null);
        if (others) block.append(others);
        const compAcq = compAcquisition(c);
        if (compAcq) block.append(compAcq);
        if (!c.relics.length && !c.otherSources.length && !compAcq) {
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
            el('span', { class: 'sub', text: `${placeName(f.node)} · ${enemyName(f.enemy)}${f.isHard ? ` · ${t('fissures.hard')}` : ''}${f.isStorm ? ` · ${t('fissures.storm')}` : ''}` }),
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
