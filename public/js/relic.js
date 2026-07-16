'use strict';

(() => {
  const { el, api, qs, fmtPct, tierBadge, rarityChip, statusBadge, startTimers } = App;
  const root = document.getElementById('content');

  const REFINEMENTS = ['Intact', 'Exceptional', 'Flawless', 'Radiant'];
  const REF_PT = { Intact: 'Intacta', Exceptional: 'Excepcional', Flawless: 'Impecável', Radiant: 'Radiante' };
  const REF_COST = { Intact: '0', Exceptional: '25', Flawless: '50', Radiant: '100' };

  function render(relic) {
    document.title = `${relic.name} Relic — Warframe Farm Helper`;
    let current = 'Intact';

    const rewardsBody = el('div');
    const refBar = el('div', { class: 'tier-toggle', role: 'group', 'aria-label': 'Refinamento' });

    function renderRewards() {
      const rows = (relic.rewards[current] || []).slice()
        .sort((a, b) => (b.chance || 0) - (a.chance || 0));
      rewardsBody.replaceChildren(
        el('p', { class: 'muted small', text: `Refinamento ${REF_PT[current]} (${REF_COST[current]} Void Traces)` }),
        el('ul', { class: 'rowlist' }, rows.map((r) => el('li', { class: 'row' }, [
          el('span', { class: 'grow' }, [
            r.parentUrl
              ? el('a', { href: r.parentUrl }, [el('span', { class: 'name', text: r.name })])
              : el('span', { class: 'name', text: r.name }),
          ]),
          rarityChip(r.rarity, r.rarityPt),
          el('span', { class: 'num', text: fmtPct(r.chance) }),
        ])))
      );
      for (const b of refBar.querySelectorAll('button')) {
        b.setAttribute('aria-pressed', String(b.dataset.ref === current));
      }
    }

    for (const ref of REFINEMENTS) {
      refBar.append(el('button', {
        type: 'button', dataset: { ref }, 'aria-pressed': String(ref === current),
        text: REF_PT[ref],
        onclick: () => { current = ref; renderRewards(); },
      }));
    }

    const frag = [
      el('section', { class: 'panel' }, [
        el('div', { class: 'item-hero' }, [
          el('div', { class: 'meta' }, [
            el('h1', {}, [tierBadge(relic.tier), ` Relíquia ${relic.name}`]),
            el('div', { class: 'badges-line' }, [statusBadge(relic.vaulted)]),
            relic.vaulted
              ? el('p', { class: 'desc' }, [
                'Esta relíquia está vaulted: não dropa mais em missões. Se você já tem cópias, ainda pode abri-las em fissuras ',
                el('span', { text: relic.tier }),
                '. Para conseguir de novo: troca com jogadores ou Prime Resurgence (Varzia). ',
                el('a', { href: '/faq.html?slug=24-primes-vaulted', text: 'Como funciona →' }),
              ])
              : el('p', { class: 'desc', text: 'Relíquia ativa nas tabelas de drop — dá para farmar agora.' }),
          ]),
        ]),
      ]),
      el('section', { class: 'panel' }, [
        el('p', { class: 'eyebrow', text: 'Recompensas por refinamento' }),
        refBar,
        rewardsBody,
      ]),
    ];

    if (relic.drops.length) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow', text: 'Onde a relíquia dropa' }),
        el('ul', { class: 'rowlist' }, relic.drops.slice(0, 10).map((d) => el('li', { class: 'row' }, [
          el('span', { class: 'grow name small', text: d.location }),
          el('span', { class: 'num small', text: fmtPct(d.chance) }),
        ]))),
      ]));
    }

    if (relic.activeFissures && relic.activeFissures.length) {
      frag.push(el('section', { class: 'panel panel-quiet' }, [
        el('p', { class: 'eyebrow', text: `Fissuras ${relic.tier} ativas agora` }),
        el('ul', { class: 'rowlist' }, relic.activeFissures.map((f) => el('li', { class: 'row' }, [
          tierBadge(f.tier),
          el('span', { class: 'grow' }, [
            el('span', { class: 'name', text: f.missionType }),
            el('br'),
            el('span', { class: 'sub', text: `${f.node} · ${f.enemy}${f.isHard ? ' · Steel Path' : ''}${f.isStorm ? ' · Railjack' : ''}` }),
          ]),
          el('span', { class: 'time num', dataset: { expiry: f.expiry } }),
        ]))),
      ]));
    }

    root.replaceChildren(...frag);
    renderRewards();
    startTimers();
  }

  const name = (qs('n') || '').trim();
  if (!name) {
    root.replaceChildren(el('div', { class: 'error-box', text: 'Relíquia não especificada (ex.: /relic.html?n=Lith K12).' }));
  } else {
    api(`/api/relic?n=${encodeURIComponent(name)}`)
      .then(render)
      .catch((err) => root.replaceChildren(el('div', { class: 'error-box', text: `Não deu para carregar a relíquia: ${err.message}` })));
  }
})();
