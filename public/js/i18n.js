'use strict';

/**
 * i18n do lado do cliente. Idioma em localStorage (`wfh-lang`), default pelo
 * navegador (pt/en). Trocar idioma recarrega a página — os dados são
 * re-buscados e re-renderizados com nameFor()/missionName() no idioma certo.
 * As strings da UI vêm de STRINGS; nomes de item vêm do WFCD (name/namePt).
 */

const I18n = (() => {
  const LANG_KEY = 'wfh-lang';
  const SUPPORTED = ['pt', 'en'];

  let current = (localStorage.getItem(LANG_KEY) || (navigator.language || 'pt').slice(0, 2)).toLowerCase();
  if (!SUPPORTED.includes(current)) current = 'pt';

  const STRINGS = {
    pt: {
      'brand.sub': 'FARM HELPER',
      'nav.search': 'Buscar', 'nav.fissures': 'Fissuras', 'nav.nightwave': 'Nightwave', 'nav.faq': 'FAQ',
      'search.placeholder': 'Item, relíquia, mecânica…',
      'search.placeholderBig': 'Ex.: Braton Prime Stock, Apótico do Anoitecer, o que fazer com kubrow…',
      'search.button': 'Buscar', 'search.aria': 'Buscar item, relíquia ou dúvida',
      'lang.aria': 'Idioma',
      'home.h1a': 'Onde', 'home.h1b': 'farmar', 'home.h1c': 'qualquer coisa em Warframe',
      'home.lead': 'Item, relíquia, mecânica ou ato do Nightwave — uma busca só, em português, com dados oficiais de drop e o estado do jogo agora.',
      'home.examples': 'Exemplos de busca',
      'home.searchHint': 'Use a busca no topo da página. Comece por um exemplo:',
      'ex.bratonStock': 'Braton Prime Stock', 'ex.kubrow': 'O que fazer com Kubrow?',
      'ex.apothic': 'Apótico do Anoitecer', 'ex.crewship': 'Crewship + Artilharia Frontal',
      'fissures.title': 'Fissuras do Void — agora', 'fissures.active': '{n} ativas',
      'fissures.normal': 'Normais', 'fissures.hard': 'Steel Path', 'fissures.storm': 'Railjack',
      'fissures.type': 'Tipo de fissura', 'fissures.loading': 'Consultando o worldstate…',
      'fissures.none': 'Nenhuma fissura desse tipo agora.',
      'fissures.down': 'Worldstate indisponível agora — tente recarregar.',
      'nw.weekTitle': 'Nightwave — atos da semana', 'nw.loading': 'Carregando atos…',
      'nw.allActs': 'Todos os atos + guias', 'nw.none': 'Sem atos ativos agora (intervalo de temporada).',
      'nw.down': 'Nightwave indisponível agora.',
      'nw.daily': 'diário', 'nw.weekly': 'semanal', 'nw.elite': 'elite', 'nw.guide': 'Guia',
      'nw.howto': 'Como fazer', 'nw.noguide': 'sem guia ainda',
      'nw.dailyActs': 'Atos diários', 'nw.weeklyActs': 'Atos semanais', 'nw.eliteActs': 'Atos de elite',
      'nw.library': 'Biblioteca de guias', 'nw.libraryHint': 'atos recorrentes de outras semanas',
      'nw.boardTitle': 'Nightwave — atos da semana',
      'nw.boardLead': 'Os atos ativos agora, com guia em português de como fazer cada um. ',
      'nw.seasonEnds': 'Temporada termina em {t}.',
      'nw.backList': '← atos e guias do Nightwave', 'nw.standing': '{n} standing',
      'nw.seasonEndsPre': 'Temporada termina em ',
      'baro.title': "Baro Ki'Teer", 'baro.loading': 'Consultando…',
      'baro.none': 'Sem dados do Void Trader agora.', 'baro.down': 'Void Trader indisponível agora.',
      'baro.here': 'Na relay {loc} com {n} itens · vai embora em ', 'baro.coming': 'Chega em ',
      'baro.comingTail': ' ({loc}). Junte ducats!',
      'faq.title': 'FAQ — mecânicas do jogo', 'faq.all': 'Ver todas as perguntas',
      'faq.lead': 'As dúvidas que todo Tenno tem — respondidas em português, direto ao ponto.',
      'faq.back': '← todas as perguntas', 'faq.loading': 'Carregando FAQ…',
      'search.loading': 'Buscando…', 'search.prompt': 'Digite o que você quer farmar ou entender.',
      'search.localResults': 'Resultados locais', 'search.extResults': 'Resultados externos',
      'search.extHint': 'sites confiáveis da comunidade', 'search.alsoWeb': 'Buscar também na web',
      'search.nLocal': '{n} resultado(s) local(is) para "{q}"', 'search.noLocal': 'Nada local para "{q}"',
      'search.webCached': 'Resultados da busca web (em cache) — fontes externas:',
      'search.web': 'Resultados da busca web — fontes externas:',
      'search.webNone': 'A busca web não retornou nada para esse termo.',
      'search.linksDefault': 'Busque direto nos sites confiáveis:',
      'search.failed': 'A busca falhou: {e}', 'search.external': 'externo',
      'item.loading': 'Carregando item…', 'item.back': '← voltar', 'item.notItem': 'Item não especificado.',
      'item.loadFail': 'Não deu para carregar o item: {e}',
      'item.wiki': 'Página na wiki', 'item.forge': 'Forja (Foundry)',
      'item.credits': 'Créditos', 'item.time': 'Tempo', 'item.rush': 'Apressar', 'item.platina': 'platina',
      'item.mrMin': 'Maestria mínima', 'item.steps': 'Como conseguir — passo a passo',
      'item.usedIn': 'Usado para construir', 'item.usedInHint': 'este item é matéria-prima destas armas',
      'item.components': 'Componentes', 'item.componentsHint': 'relíquias disponíveis primeiro',
      'item.otherSources': 'Outras fontes', 'item.noSource': 'Sem fonte de drop nas tabelas oficiais (recurso comum, quest, loja ou pesquisa de clã — veja a wiki).',
      'item.whereDrops': 'Onde dropa', 'item.fissNow': 'Fissuras ativas para farmar agora',
      'item.fissHint': 'tiers das relíquias disponíveis',
      'item.market': 'Ou compre de outro jogador', 'item.marketHint': 'warframe.market · menor preço de venda',
      'item.marketLoading': 'Consultando preços no warframe.market…', 'item.marketOrders': 'ver ordens',
      'relic.loading': 'Carregando relíquia…', 'relic.notFound': 'Relíquia não especificada (ex.: /relic.html?n=Lith K12).',
      'relic.loadFail': 'Não deu para carregar a relíquia: {e}', 'relic.relic': 'Relíquia',
      'relic.vaultedMsg': 'Esta relíquia está vaulted: não dropa mais em missões. Se você já tem cópias, ainda pode abri-las em fissuras {t}. Para conseguir de novo: troca com jogadores ou Prime Resurgence (Varzia). ',
      'relic.vaultedLink': 'Como funciona →', 'relic.availMsg': 'Relíquia ativa nas tabelas de drop — dá para farmar agora.',
      'relic.rewards': 'Recompensas por refinamento', 'relic.refinement': 'Refinamento {r} ({c} Void Traces)',
      'relic.whereDrops': 'Onde a relíquia dropa', 'relic.fissActive': 'Fissuras {t} ativas agora',
      'th.relic': 'Relíquia', 'th.rarity': 'Raridade', 'th.status': 'Status',
      'item.dropsAt': 'dropa em', 'item.fissNowShort': 'fissura(s) {t} agora',
      'ref.Intact': 'Intacta', 'ref.Exceptional': 'Excepcional', 'ref.Flawless': 'Impecável', 'ref.Radiant': 'Radiante',
      'status.available': 'Disponível', 'status.vaulted': 'Vaulted',
      'rar.Common': 'Comum', 'rar.Uncommon': 'Incomum', 'rar.Rare': 'Rara', 'rar.Legendary': 'Lendária',
      'sub.relic': 'Relíquia', 'sub.faq': 'FAQ · mecânicas do jogo', 'sub.nightwave': 'Guia · Nightwave',
      'sub.component': 'Componente', 'sub.gear': 'Equipamento (Gear)', 'sub.quest': 'Quest',
      'sub.arcane': 'Arcano', 'sub.mod': 'Mod', 'sub.resource': 'Recurso', 'sub.fish': 'Peixe', 'sub.item': 'Item',
      'kind.item': 'Item', 'kind.component': 'Componente', 'kind.relic': 'Relíquia', 'kind.faq': 'FAQ',
      'kind.nightwave': 'Nightwave', 'kind.mod': 'Mod', 'kind.resource': 'Recurso', 'kind.gear': 'Equipamento',
      'kind.quest': 'Quest', 'kind.arcane': 'Arcano', 'kind.fish': 'Peixe',
      'tag.mrShort': 'MR {n}', 'tag.tradable': 'Trocável', 'tag.ducats': '{n} ducats',
      'foot.disclaimer': 'Site não-oficial, feito por fã. Sem afiliação com a Digital Extremes. Warframe e o logotipo de Warframe são marcas da Digital Extremes Ltd.',
      'foot.data': 'Dados de itens e drops:', 'foot.state': 'Estado do jogo:', 'foot.prices': 'Preços:',
      'foot.code': 'Código aberto:', 'foot.dropSrc': '(drop tables oficiais da DE)',
      'e404.title': '404 — perdido no Void', 'e404.lead': 'Essa página não existe (ou foi parar num vault). Volte para a busca e tente de novo.',
      'e404.home': 'Voltar ao início',
      'cyc.aria': 'Ciclos dos mundos',
      'cyc.cetus': 'Cetus', 'cyc.vallis': 'Vallis', 'cyc.cambion': 'Deimos',
      'cyc.duviri': 'Duviri', 'cyc.zariman': 'Zariman', 'cyc.earth': 'Terra',
      'cyc.s.day': 'Dia', 'cyc.s.night': 'Noite', 'cyc.s.warm': 'Quente', 'cyc.s.cold': 'Frio',
      'cyc.s.fass': 'Fass', 'cyc.s.vome': 'Vome', 'cyc.s.grineer': 'Grineer', 'cyc.s.corpus': 'Corpus',
      'cyc.s.joy': 'Alegria', 'cyc.s.anger': 'Raiva', 'cyc.s.envy': 'Inveja',
      'cyc.s.sorrow': 'Tristeza', 'cyc.s.fear': 'Medo',
      'cyc.next': '{w}: vira {s} em {t}',
    },
    en: {
      'brand.sub': 'FARM HELPER',
      'nav.search': 'Search', 'nav.fissures': 'Fissures', 'nav.nightwave': 'Nightwave', 'nav.faq': 'FAQ',
      'search.placeholder': 'Item, relic, mechanic…',
      'search.placeholderBig': 'e.g. Braton Prime Stock, Nightfall Apothic, what to do with a kubrow…',
      'search.button': 'Search', 'search.aria': 'Search item, relic or question',
      'lang.aria': 'Language',
      'home.h1a': 'Where to', 'home.h1b': 'farm', 'home.h1c': 'anything in Warframe',
      'home.lead': 'Item, relic, mechanic or Nightwave act — one search, with official drop data and the live game state.',
      'home.examples': 'Search examples',
      'home.searchHint': 'Use the search at the top of the page. Start with an example:',
      'ex.bratonStock': 'Braton Prime Stock', 'ex.kubrow': 'What to do with a Kubrow?',
      'ex.apothic': 'Nightfall Apothic', 'ex.crewship': 'Crewship + Forward Artillery',
      'fissures.title': 'Void Fissures — now', 'fissures.active': '{n} active',
      'fissures.normal': 'Normal', 'fissures.hard': 'Steel Path', 'fissures.storm': 'Railjack',
      'fissures.type': 'Fissure type', 'fissures.loading': 'Querying worldstate…',
      'fissures.none': 'No fissures of this type right now.',
      'fissures.down': 'Worldstate unavailable right now — try reloading.',
      'nw.weekTitle': 'Nightwave — this week', 'nw.loading': 'Loading acts…',
      'nw.allActs': 'All acts + guides', 'nw.none': 'No active acts right now (between seasons).',
      'nw.down': 'Nightwave unavailable right now.',
      'nw.daily': 'daily', 'nw.weekly': 'weekly', 'nw.elite': 'elite', 'nw.guide': 'Guide',
      'nw.howto': 'How to', 'nw.noguide': 'no guide yet',
      'nw.dailyActs': 'Daily acts', 'nw.weeklyActs': 'Weekly acts', 'nw.eliteActs': 'Elite acts',
      'nw.library': 'Guide library', 'nw.libraryHint': 'recurring acts from other weeks',
      'nw.boardTitle': 'Nightwave — this week',
      'nw.boardLead': 'The acts active now, each with a guide on how to complete it. ',
      'nw.seasonEnds': 'Season ends in {t}.',
      'nw.backList': '← Nightwave acts & guides', 'nw.standing': '{n} standing',
      'nw.seasonEndsPre': 'Season ends in ',
      'baro.title': "Baro Ki'Teer", 'baro.loading': 'Querying…',
      'baro.none': 'No Void Trader data right now.', 'baro.down': 'Void Trader unavailable right now.',
      'baro.here': 'At relay {loc} with {n} items · leaves in ', 'baro.coming': 'Arrives in ',
      'baro.comingTail': ' ({loc}). Stock up on ducats!',
      'faq.title': 'FAQ — game mechanics', 'faq.all': 'See all questions',
      'faq.lead': 'The questions every Tenno has — answered, straight to the point.',
      'faq.back': '← all questions', 'faq.loading': 'Loading FAQ…',
      'search.loading': 'Searching…', 'search.prompt': 'Type what you want to farm or understand.',
      'search.localResults': 'Local results', 'search.extResults': 'External results',
      'search.extHint': 'trusted community sites', 'search.alsoWeb': 'Also search the web',
      'search.nLocal': '{n} local result(s) for "{q}"', 'search.noLocal': 'Nothing local for "{q}"',
      'search.webCached': 'Web search results (cached) — external sources:',
      'search.web': 'Web search results — external sources:',
      'search.webNone': 'The web search returned nothing for this term.',
      'search.linksDefault': 'Search directly on the trusted sites:',
      'search.failed': 'Search failed: {e}', 'search.external': 'external',
      'item.loading': 'Loading item…', 'item.back': '← back', 'item.notItem': 'No item specified.',
      'item.loadFail': "Couldn't load the item: {e}",
      'item.wiki': 'Wiki page', 'item.forge': 'Foundry',
      'item.credits': 'Credits', 'item.time': 'Time', 'item.rush': 'Rush', 'item.platina': 'platinum',
      'item.mrMin': 'Mastery required', 'item.steps': 'How to get it — step by step',
      'item.usedIn': 'Used to build', 'item.usedInHint': 'this item is a crafting ingredient for these',
      'item.components': 'Components', 'item.componentsHint': 'available relics first',
      'item.otherSources': 'Other sources', 'item.noSource': 'No drop source in the official tables (common resource, quest, shop or clan research — see the wiki).',
      'item.whereDrops': 'Where it drops', 'item.fissNow': 'Fissures active to farm now',
      'item.fissHint': 'tiers of the available relics',
      'item.market': 'Or buy from another player', 'item.marketHint': 'warframe.market · lowest sell price',
      'item.marketLoading': 'Querying prices on warframe.market…', 'item.marketOrders': 'view orders',
      'relic.loading': 'Loading relic…', 'relic.notFound': 'No relic specified (e.g. /relic.html?n=Lith K12).',
      'relic.loadFail': "Couldn't load the relic: {e}", 'relic.relic': 'Relic',
      'relic.vaultedMsg': 'This relic is vaulted: it no longer drops in missions. If you already have copies, you can still crack them in {t} fissures. To get more: trade with players or Prime Resurgence (Varzia). ',
      'relic.vaultedLink': 'How it works →', 'relic.availMsg': 'Relic active in the drop tables — farmable now.',
      'relic.rewards': 'Rewards by refinement', 'relic.refinement': '{r} refinement ({c} Void Traces)',
      'relic.whereDrops': 'Where the relic drops', 'relic.fissActive': '{t} fissures active now',
      'th.relic': 'Relic', 'th.rarity': 'Rarity', 'th.status': 'Status',
      'item.dropsAt': 'drops at', 'item.fissNowShort': '{t} fissure(s) now',
      'ref.Intact': 'Intact', 'ref.Exceptional': 'Exceptional', 'ref.Flawless': 'Flawless', 'ref.Radiant': 'Radiant',
      'status.available': 'Available', 'status.vaulted': 'Vaulted',
      'rar.Common': 'Common', 'rar.Uncommon': 'Uncommon', 'rar.Rare': 'Rare', 'rar.Legendary': 'Legendary',
      'sub.relic': 'Relic', 'sub.faq': 'FAQ · game mechanics', 'sub.nightwave': 'Guide · Nightwave',
      'sub.component': 'Component', 'sub.gear': 'Gear', 'sub.quest': 'Quest',
      'sub.arcane': 'Arcane', 'sub.mod': 'Mod', 'sub.resource': 'Resource', 'sub.fish': 'Fish', 'sub.item': 'Item',
      'kind.item': 'Item', 'kind.component': 'Component', 'kind.relic': 'Relic', 'kind.faq': 'FAQ',
      'kind.nightwave': 'Nightwave', 'kind.mod': 'Mod', 'kind.resource': 'Resource', 'kind.gear': 'Gear',
      'kind.quest': 'Quest', 'kind.arcane': 'Arcane', 'kind.fish': 'Fish',
      'tag.mrShort': 'MR {n}', 'tag.tradable': 'Tradable', 'tag.ducats': '{n} ducats',
      'foot.disclaimer': 'Unofficial fan-made site. Not affiliated with Digital Extremes. Warframe and the Warframe logo are trademarks of Digital Extremes Ltd.',
      'foot.data': 'Item & drop data:', 'foot.state': 'Game state:', 'foot.prices': 'Prices:',
      'foot.code': 'Open source:', 'foot.dropSrc': "(DE's official drop tables)",
      'e404.title': '404 — lost in the Void', 'e404.lead': "This page doesn't exist (or got vaulted). Head back to search and try again.",
      'e404.home': 'Back to home',
      'cyc.aria': 'World cycles',
      'cyc.cetus': 'Cetus', 'cyc.vallis': 'Vallis', 'cyc.cambion': 'Deimos',
      'cyc.duviri': 'Duviri', 'cyc.zariman': 'Zariman', 'cyc.earth': 'Earth',
      'cyc.s.day': 'Day', 'cyc.s.night': 'Night', 'cyc.s.warm': 'Warm', 'cyc.s.cold': 'Cold',
      'cyc.s.fass': 'Fass', 'cyc.s.vome': 'Vome', 'cyc.s.grineer': 'Grineer', 'cyc.s.corpus': 'Corpus',
      'cyc.s.joy': 'Joy', 'cyc.s.anger': 'Anger', 'cyc.s.envy': 'Envy',
      'cyc.s.sorrow': 'Sorrow', 'cyc.s.fear': 'Fear',
      'cyc.next': '{w}: {s} in {t}',
    },
  };

  const MISSIONS = {
    Extermination: { pt: 'Extermínio', en: 'Extermination' }, Capture: { pt: 'Captura', en: 'Capture' },
    Survival: { pt: 'Sobrevivência', en: 'Survival' }, Defense: { pt: 'Defesa', en: 'Defense' },
    'Mobile Defense': { pt: 'Defesa Móvel', en: 'Mobile Defense' }, Rescue: { pt: 'Resgate', en: 'Rescue' },
    Sabotage: { pt: 'Sabotagem', en: 'Sabotage' }, Spy: { pt: 'Espionagem', en: 'Spy' },
    Interception: { pt: 'Interceptação', en: 'Interception' }, Excavation: { pt: 'Escavação', en: 'Excavation' },
    Disruption: { pt: 'Disrupção', en: 'Disruption' }, Hijack: { pt: 'Sequestro de Carga', en: 'Hijack' },
    Assault: { pt: 'Assalto', en: 'Assault' }, 'Free Roam': { pt: 'Mundo Aberto', en: 'Free Roam' },
    Skirmish: { pt: 'Escaramuça', en: 'Skirmish' }, Volatile: { pt: 'Volátil', en: 'Volatile' },
    Orphix: { pt: 'Orphix', en: 'Orphix' }, 'Void Cascade': { pt: 'Cascata do Void', en: 'Void Cascade' },
    'Void Flood': { pt: 'Inundação do Void', en: 'Void Flood' },
    'Void Armageddon': { pt: 'Armagedom do Void', en: 'Void Armageddon' },
    Alchemy: { pt: 'Alquimia', en: 'Alchemy' }, Hive: { pt: 'Colmeia', en: 'Hive' },
    Assassination: { pt: 'Assassinato', en: 'Assassination' }, Arena: { pt: 'Arena', en: 'Arena' },
    Defection: { pt: 'Deserção', en: 'Defection' }, 'Infested Salvage': { pt: 'Recuperação Infestada', en: 'Infested Salvage' },
  };

  const ENEMIES = {
    Grineer: { pt: 'Grineer', en: 'Grineer' }, Corpus: { pt: 'Corpus', en: 'Corpus' },
    Infested: { pt: 'Infestados', en: 'Infested' }, Corrupted: { pt: 'Corrompidos', en: 'Corrupted' },
    Orokin: { pt: 'Orokin', en: 'Orokin' }, Sentient: { pt: 'Senciente', en: 'Sentient' },
    'The Murmur': { pt: 'The Murmur', en: 'The Murmur' }, Narmer: { pt: 'Narmer', en: 'Narmer' },
    Crossfire: { pt: 'Fogo Cruzado', en: 'Crossfire' },
  };

  function t(key, vars) {
    let s = (STRINGS[current] && STRINGS[current][key]) || (STRINGS.pt && STRINGS.pt[key]) || key;
    if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, vars[k]);
    return s;
  }
  const lang = () => current;
  function setLang(l) {
    if (SUPPORTED.includes(l) && l !== current) {
      localStorage.setItem(LANG_KEY, l);
      location.reload();
    }
  }
  const nameFor = (o) => (o ? (current === 'pt' ? (o.namePt || o.name) : o.name) : '');
  const missionName = (m) => (MISSIONS[m] ? MISSIONS[m][current] : m);
  const enemyName = (e) => (ENEMIES[e] ? ENEMIES[e][current] : e);

  function subLabel(r) {
    switch (r.kind) {
      case 'relic': return `${t('sub.relic')} · ${r.sub === 'vaulted' ? t('status.vaulted') : t('status.available')}`;
      case 'faq': return t('sub.faq');
      case 'nightwave': return t('sub.nightwave');
      case 'component': return t('sub.component');
      case 'gear': return t('sub.gear');
      case 'quest': return t('sub.quest');
      case 'arcane': return t('sub.arcane');
      case 'mod': return t('sub.mod');
      case 'resource': return t('sub.resource');
      case 'fish': return t('sub.fish');
      default: return r.sub || t('sub.item');
    }
  }

  /** Preenche elementos estáticos: [data-i18n]=textContent, [data-i18n-ph]=placeholder. */
  function applyStatic(root) {
    for (const el of (root || document).querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.getAttribute('data-i18n'));
    }
    for (const el of (root || document).querySelectorAll('[data-i18n-ph]')) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    }
  }

  document.documentElement.lang = current;
  return { t, lang, setLang, nameFor, missionName, enemyName, subLabel, applyStatic, SUPPORTED };
})();
