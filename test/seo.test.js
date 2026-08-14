'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// DB efêmero - precisa ser definido ANTES de carregar os módulos
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-seo-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.DATA_DIR = TMP;

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb, setMeta } = require('../server/db');
const seo = require('../server/seo');

// ---------------------------------------------------------------------------
// núcleo puro
// ---------------------------------------------------------------------------

test('slugify: minúsculas, sem acento, símbolos viram hífen', () => {
  assert.equal(seo.slugify('Braton Prime'), 'braton-prime');
  assert.equal(seo.slugify('Apótico do Anoitecer'), 'apotico-do-anoitecer');
  assert.equal(seo.slugify("Baro Ki'Teer  ×2!"), 'baro-ki-teer-2');
  assert.equal(seo.slugify('  --  '), '');
});

test('assignSlugs: nomes duplicados ganham -2/-3 de forma determinística', () => {
  const rows = [
    { unique_name: '/a', name: 'Ammo Drum' },
    { unique_name: '/b', name: 'Ammo Drum' },
    { unique_name: '/c', name: 'Ammo Drum' },
    { unique_name: '/d', name: 'Outro' },
  ];
  const { byUnique, bySlug } = seo.assignSlugs(rows);
  assert.equal(byUnique.get('/a'), 'ammo-drum');
  assert.equal(byUnique.get('/b'), 'ammo-drum-2');
  assert.equal(byUnique.get('/c'), 'ammo-drum-3');
  assert.equal(bySlug.get('ammo-drum-2'), '/b');
  // rodar de novo com a mesma ordem → mesmos slugs
  const again = seo.assignSlugs(rows);
  assert.deepEqual([...again.byUnique.entries()], [...byUnique.entries()]);
});

test('assignCanonicals: gêmeos (mesmo kind+nome) apontam para o primeiro; kinds diferentes não', () => {
  const rows = [
    { unique_name: '/m1', name: 'Adaptation', category: 'Mods' },
    { unique_name: '/m2', name: 'Adaptation', category: 'Mods' },
    { unique_name: '/r1', name: 'Adaptation', category: 'Resources' },
  ];
  const canon = seo.assignCanonicals(rows);
  assert.equal(canon.get('/m1'), '/m1');
  assert.equal(canon.get('/m2'), '/m1'); // gêmeo → canônico no primeiro
  assert.equal(canon.get('/r1'), '/r1'); // kind diferente → página própria
});

test('injectHead: substitui title (sem data-i18n), description, insere canonical/OG/JSON-LD escapados', () => {
  const tpl = '<html><head><title data-i18n="x">Genérico</title>\n'
    + '<meta name="description" content="antiga">\n</head><body></body></html>';
  const out = seo.injectHead(tpl, {
    title: 'Onde farmar "Braton" & Cia <Prime>',
    description: 'desc & <nova>',
    canonical: '/item/braton-prime',
    jsonLd: { '@type': 'BreadcrumbList', name: '</script><script>alert(1)</script>' },
  });
  assert.ok(out.includes('<title>Onde farmar &quot;Braton&quot; &amp; Cia &lt;Prime&gt;</title>'));
  assert.ok(!out.includes('data-i18n="x"'), 'data-i18n do title deve sair (cliente não sobrescreve)');
  assert.ok(out.includes('<meta name="description" content="desc &amp; &lt;nova&gt;">'));
  assert.ok(!out.includes('content="antiga"'));
  assert.ok(out.includes('<link rel="canonical" href="https://warframe.bobagi.space/item/braton-prime">'));
  assert.ok(out.includes('property="og:title"'));
  assert.ok(out.includes('application/ld+json'));
  // "<" do JSON-LD escapado → não dá para fechar a tag <script> por dentro
  assert.ok(!out.includes('</script><script>alert'));
  assert.ok(out.includes('\\u003c/script'));
});

test('injectBodyData/injectContent: data-attrs escapados e marcador substituído', () => {
  const tpl = '<body>\n<div id="content"><!-- ssr:content --><p>spin</p></div>';
  const withData = seo.injectBodyData(tpl, { 'item-u': '/Lotus/"x"&<y>' });
  assert.ok(withData.includes('<body data-item-u="/Lotus/&quot;x&quot;&amp;&lt;y&gt;">'));
  const withContent = seo.injectContent(withData, '<h1>SSR</h1>');
  assert.ok(withContent.includes('<h1>SSR</h1><p>spin</p>'));
});

test('injectHead: titleI18n mantém data-i18n; $-patterns de dado externo entram literais', () => {
  const tpl = '<html><head><title data-i18n="x">Genérico</title>\n</head><body></body></html>';
  // título com padrões especiais de String.replace ($$, $&, $n) - vindos do WFCD
  const out = seo.injectHead(tpl, { title: 'Preço $$ e $& e $1', titleI18n: 'title.faq', canonical: '/x' });
  assert.ok(out.includes('data-i18n="title.faq"'), 'com titleI18n o hook de i18n é mantido no title');
  // escapeHtml só troca o & de "$&" por "&amp;"; os $ seguem literais (função de replace)
  assert.ok(out.includes('<title data-i18n="title.faq">Preço $$ e $&amp; e $1</title>'),
    'padrões $ do nome externo entram literalmente, não interpretados por .replace()');
  assert.equal((out.match(/<title/g) || []).length, 1, 'não duplicou o <title> (sinal de $& interpretado)');
});

test('injectContent: $-patterns no bloco SSR entram literais (não interpretados)', () => {
  const out = seo.injectContent('<div><!-- ssr:content --></div>', '<p>custa $5, $& e $$</p>');
  assert.ok(out.includes('<p>custa $5, $& e $$</p>'), 'conteúdo SSR com $ entra literal');
  assert.ok(!out.includes('ssr:content'), 'marcador consumido');
});

test('buildSitemapXml: URLs absolutas e escapadas', () => {
  const xml = seo.buildSitemapXml([
    { loc: '/', lastmod: '2026-07-18', changefreq: 'daily', priority: '1.0' },
    { loc: '/item/a-b', lastmod: '2026-07-18' },
  ]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<loc>https://warframe.bobagi.space/</loc>'));
  assert.ok(xml.includes('<loc>https://warframe.bobagi.space/item/a-b</loc>'));
  assert.ok(xml.includes('<changefreq>daily</changefreq>'));
});

test('truncate corta em palavra; stripTags remove tags e entidades', () => {
  const long = 'palavra '.repeat(40).trim();
  const cut = seo.truncate(long, 60);
  assert.ok(cut.length <= 60);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.includes('palavr…'), 'não corta no meio da palavra');
  assert.equal(seo.stripTags('<p>Olá <b>mundo</b>&nbsp;&amp; cia</p>'), 'Olá mundo & cia');
});

// ---------------------------------------------------------------------------
// com banco semeado (mesmo padrão dos testes de busca)
// ---------------------------------------------------------------------------

const EVIL_NAME = '<script>alert(1)</script>"Evil" & Co';

function seed() {
  const db = getDb();
  const ins = db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  ins.run('/Lotus/Test/BratonPrime', 'Braton Prime', null, 'Primary', 'Rifle', 8, 0, 'bp.png', null, 1,
    JSON.stringify({ name: 'Braton Prime', description: 'A classic Orokin weapon.', imageName: 'bp.png' }));
  // gêmeos: mesmo nome/categoria, uniqueNames diferentes
  ins.run('/Lotus/Test/TwinA', 'Entrati Lanthorn', null, 'Resources', 'Resource', null, null, null, null, 0,
    JSON.stringify({ name: 'Entrati Lanthorn' }));
  ins.run('/Lotus/Test/TwinB', 'Entrati Lanthorn', null, 'Resources', 'Resource', null, null, null, null, 0,
    JSON.stringify({ name: 'Entrati Lanthorn' }));
  // item hostil (nome vindo de dado externo) - SSR precisa escapar
  ins.run('/Lotus/Test/Evil', EVIL_NAME, null, 'Mods', 'Mod', null, null, null, null, 0,
    JSON.stringify({ name: EVIL_NAME, description: 'x < y & "z"' }));
  db.prepare('INSERT OR REPLACE INTO relics(name, tier, code, vaulted, drops, rewards) VALUES (?,?,?,?,?,?)')
    .run('Lith K12', 'Lith', 'K12', 0, '[]',
      JSON.stringify({ Intact: [{ name: 'Braton Prime Stock', rarity: 'Common', chance: 25.33 }] }));
  db.prepare(`INSERT OR REPLACE INTO articles(slug, kind, title, keywords, match_json, html, body_md, sort)
    VALUES ('reliquias-teste', 'faq', 'Relíquias - como funcionam?', 'reliquia', NULL,
      '<p>Texto completo do artigo sobre relíquias.</p>', 'x', 10)`).run();
  setMeta(db, 'last_ingest', '2026-07-18T00:00:00.000Z');
}

test('rebuild + itemUrl/itemForSlug: URL bonita e lookup de ida e volta', () => {
  seed();
  seo.rebuild();
  assert.equal(seo.itemUrl('/Lotus/Test/BratonPrime'), '/item/braton-prime');
  const row = seo.itemForSlug('braton-prime');
  assert.equal(row.unique_name, '/Lotus/Test/BratonPrime');
  // unique desconhecido cai na URL legada (não quebra link)
  assert.ok(seo.itemUrl('/Lotus/Nope').startsWith('/item.html?u='));
  assert.equal(seo.itemForSlug('nao-existe'), null);
});

test('renderItemPage: title/canonical/data-item-u/SSR h1 presentes', () => {
  const html = seo.renderItemPage('braton-prime');
  assert.ok(html.includes('<title>Where to farm Braton Prime · Warframe Farm Helper</title>'),
    'o title segue o padrão de busca real medido no Search Console ("where to farm x")');
  assert.ok(html.includes('rel="canonical" href="https://warframe.bobagi.space/item/braton-prime"'));
  assert.ok(html.includes('data-item-u="/Lotus/Test/BratonPrime"'));
  assert.ok(html.includes('<h1>Braton Prime</h1>'));
  assert.ok(html.includes('A classic Orokin weapon.'));
  assert.equal(seo.renderItemPage('inexistente'), null);
});

test('renderItemPage escapa nome hostil (XSS de dado externo)', () => {
  const slug = seo.itemUrl('/Lotus/Test/Evil').replace('/item/', '');
  const html = seo.renderItemPage(slug);
  assert.ok(html, 'página do item hostil renderiza');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script cru não pode aparecer');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'nome aparece escapado');
});

test('safeHttpUrl: só http/https passa (href de wiki_url do dataset externo)', () => {
  assert.equal(seo.safeHttpUrl('https://wiki.warframe.com/w/Braton_Prime'), 'https://wiki.warframe.com/w/Braton_Prime');
  assert.equal(seo.safeHttpUrl('http://x.test/y'), 'http://x.test/y');
  assert.equal(seo.safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(seo.safeHttpUrl('JavaScript:alert(1)'), null);
  assert.equal(seo.safeHttpUrl('data:text/html,<script>'), null);
  assert.equal(seo.safeHttpUrl('  javascript:alert(1)'), null);
  assert.equal(seo.safeHttpUrl(''), null);
  assert.equal(seo.safeHttpUrl(null), null);
});

test('renderItemPage NÃO emite href com esquema perigoso (wiki_url hostil)', () => {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO items
    (unique_name, name, name_pt, category, type, mastery_req, vaulted, image_name, wiki_url, tradable, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('/Lotus/Test/JsWiki', 'Js Wiki Item', null, 'Mods', 'Mod', null, null, null,
      'javascript:alert(3)', 0, JSON.stringify({ name: 'Js Wiki Item' }));
  seo.rebuild();
  const slug = seo.itemUrl('/Lotus/Test/JsWiki').replace('/item/', '');
  const html = seo.renderItemPage(slug);
  assert.ok(!html.includes('href="javascript:'), 'nenhum href javascript: no HTML');
  assert.ok(!html.includes('Página na wiki'), 'link da wiki suprimido quando o esquema é perigoso');
});

test('gêmeos: canonical aponta para o primeiro; sitemap só lista o canônico', () => {
  const urlA = seo.itemUrl('/Lotus/Test/TwinA');
  const urlB = seo.itemUrl('/Lotus/Test/TwinB');
  assert.notEqual(urlA, urlB, 'cada gêmeo tem sua URL');
  const slugB = urlB.replace('/item/', '');
  const htmlB = seo.renderItemPage(slugB);
  // o canonical da página do gêmeo B aponta para a URL do A (consolidação)
  assert.ok(htmlB.includes(`rel="canonical" href="https://warframe.bobagi.space${urlA}"`));
  const xml = seo.sitemapXml();
  assert.ok(xml.includes(`<loc>https://warframe.bobagi.space${urlA}</loc>`));
  assert.ok(!xml.includes(`<loc>https://warframe.bobagi.space${urlB}</loc>`), 'gêmeo não-canônico fora do sitemap');
});

test('sitemap: páginas fixas + item + relíquia + artigo, com lastmod da ingestão', () => {
  const xml = seo.sitemapXml();
  for (const loc of ['/', '/fissuras', '/faq', '/nightwave', '/buscar',
    '/item/braton-prime', '/relic/lith-k12', '/faq/reliquias-teste']) {
    assert.ok(xml.includes(`<loc>https://warframe.bobagi.space${loc}</loc>`), `faltou ${loc}`);
  }
  assert.ok(xml.includes('<lastmod>2026-07-18</lastmod>'));
});

test('renderRelicPage: h1, recompensas Intact no SSR e slug inválido → null', () => {
  const html = seo.renderRelicPage('lith-k12');
  assert.ok(html.includes('<title>Lith K12 Relic drops and rewards · Warframe Farm Helper</title>'));
  assert.ok(html.includes('<h1>Lith K12 Relic</h1>'));
  assert.ok(html.includes('Braton Prime Stock'));
  assert.ok(html.includes('data-relic-name="Lith K12"'));
  assert.equal(seo.renderRelicPage('../../etc/passwd'), null);
  assert.equal(seo.renderRelicPage('axi-zz99'), null);
});

test('renderArticlePage: conteúdo COMPLETO no HTML (crawler sem JS lê o artigo)', () => {
  const html = seo.renderArticlePage('faq', 'reliquias-teste');
  assert.ok(html.includes('<h1>Relíquias - como funcionam?</h1>'));
  assert.ok(html.includes('Texto completo do artigo sobre relíquias.'));
  assert.ok(html.includes('rel="canonical" href="https://warframe.bobagi.space/faq/reliquias-teste"'));
  assert.ok(html.includes('data-art-slug="reliquias-teste"'));
  assert.equal(seo.renderArticlePage('nightwave', 'reliquias-teste'), null, 'kind errado não vaza artigo');
  assert.equal(seo.renderArticlePage('faq', 'Slug Inválido!'), null);
});

test('renderFaqIndex: JSON-LD FAQPage com pergunta e resposta', () => {
  const html = seo.renderFaqIndex();
  assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('FAQPage'));
  assert.ok(html.includes('Relíquias - como funcionam?'));
  assert.ok(html.includes('Texto completo do artigo'));
});

test('índices (/faq, /nightwave): title mantém data-i18n p/ o cliente relocalizar a aba (en/es/ru)', () => {
  const faq = seo.renderFaqIndex();
  assert.ok(faq.includes('data-i18n="title.faq"'), 'FAQ índice mantém hook i18n no title');
  assert.ok(faq.includes('Warframe FAQ · game mechanics explained'), 'e serve o título rico p/ o crawler');
  const nw = seo.renderNightwaveIndex();
  assert.ok(nw.includes('data-i18n="title.nightwave"'), 'Nightwave índice mantém hook i18n no title');
});

test('renderNoindex: robots noindex no fallback legado', () => {
  const html = seo.renderNoindex('item.html');
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
});

test('SSR é em INGLÊS e os nomes localizados vão para o corpo, não para o title', () => {
  // O Search Console mostrou que 100% das buscas que chegam ao site são em
  // inglês. O title tem que ser limpo e em inglês; o nome pt/zh continua no
  // HTML (cauda longa) mas fora do título, que é o que aparece no resultado.
  seed();
  const html = seo.renderItemPage('braton-prime');
  assert.ok(html.includes('<title>Where to farm Braton Prime · Warframe Farm Helper</title>'));
  assert.ok(!/<title>[^<]*Onde farmar/.test(html), 'nada de português no title');
  assert.ok(/<html lang="en"/.test(html), 'o HTML servido ao crawler declara inglês');
  assert.ok(html.includes('Where to get') || html.includes('How to farm'),
    'a description usa o padrão de busca em inglês');
});
