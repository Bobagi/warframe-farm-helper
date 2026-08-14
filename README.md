# Warframe Farm Helper

**Buscador de farm unificado para Warframe, em português.** Numa busca só responde o que hoje exige
visitar 3+ sites: **onde dropa** qualquer item, se a relíquia está **disponível ou vaulted**, **quais
fissuras do Void estão ativas agora**, um **FAQ de mecânicas** e **guias dos atos do Nightwave** (inclusive
os chatos: destruir Crewship com Artilharia Frontal, enigmas do Duviri, etc.).

🔗 **No ar:** https://warframe.bobagi.space

> Site não-oficial, feito por fã. Sem afiliação com a Digital Extremes. Dados de itens/drops: **WFCD**
> (drop tables oficiais da DE) e os módulos de dados da **wiki oficial** (pesquisa de clã, vendedores,
> Mercado). Estado do jogo: **warframestat.us**. Preços: **warframe.market**.

## O que ele faz

- **Busca no topo de todas as páginas** - barra fixa no cabeçalho (com autocomplete) como entrada única de
  busca; a home usa chips de exemplo como atalhos. O autocomplete é resistente a corrida ("última vence":
  aborta a query anterior e descarta respostas fora de ordem - ver `public/js/latest.js`), então o dropdown
  nunca mostra resultado de um texto já apagado. A página `/buscar` mantém a barra grande da própria página.
- **Idioma PT / EN** - toggle no cabeçalho. Detecta o idioma pelo navegador e deixa trocar na mão (persiste).
  Traduz a interface, os **nomes de item** (i18n do WFCD), as missões das fissuras e o **passo a passo**
  (gerado bilíngue no servidor). Os artigos de FAQ/Nightwave são escritos em PT - em modo EN o título e a
  navegação traduzem, mas o corpo do artigo permanece em português (conteúdo da comunidade).
- **Página de item** - árvore de componentes com relíquias (destaque disponível × vaulted), chances
  intact/radiante, requisitos de forja (créditos/tempo/MR), fontes de drop não-relíquia e **passo a passo**
  em linguagem simples. Cobre armas, warframes, **gear/itens de quest** (ex.: Apótico do Anoitecer),
  arcanos e peixes - não só primes. Mostra também **"usado para construir"** (índice reverso: quando o
  item é matéria-prima de outro, ex.: Furis → Afuris), montado na ingestão a partir dos components.
- **Relíquias** - recompensas por refinamento (Intact→Radiant), onde a relíquia dropa, status vaulted e
  fissuras ativas do tier.
- **Prime Resurgence (Varzia)** - painel na home com a rotação de ~28 dias que **desvaulta** um conjunto de
  primes, com contagem regressiva, os primes da vez, quantas relíquias voltaram, os tiers à venda e qual é
  a **próxima** rotação (lida do `schedule` da API). Uma relíquia de prime em rotação continua `vaulted` na
  drop table (não volta a cair em missão), mas dá para **comprá-la com Aya** enquanto durar - então ela
  ganha o badge **"Na Varzia"** na página da relíquia, sobe para o nível das disponíveis na página do item,
  e o passo a passo passa a mandar comprar em vez de "aguarde voltar".
  A API não diz QUAIS relíquias a Varzia vende (o inventário traz os primes e pacotes genéricos por tier),
  então a lista é **derivada**: entra a relíquia que contém peça de um dos primes da rotação, que é o mesmo
  critério do pacote no jogo. Ver `server/varzia.js`.
- **Relógios dos mundos** - faixa fixa abaixo do cabeçalho (em todas as páginas) com o ciclo de cada
  mundo que tem dia/noite: **Cetus / Terra** (dia/noite), **Vallis** (quente/frio), **Deimos** (Fass/Vome),
  **Duviri** (humores do Spiral) e **Zariman** (Grineer/Corpus), cada um com contagem regressiva ao vivo.
  O servidor avança o estado localmente pela tabela de durações, então a faixa nunca mostra ciclo vencido -
  mesmo se o worldstate upstream cair.
  **Cetus / Terra num chip só:** desde o Update 38.5 a Terra não tem mais ciclo próprio de 8h - ela segue o
  Cetus/Plains (dia 100min, noite 50min), então carrega **sempre** a mesma info e é mostrada junto. A API
  `/earthCycle` ainda calcula o ciclo legado de 8h e fica dessincronizada do jogo; por isso a Terra vem do
  `cetusCycle` (fonte real da DE) - o ciclo do Cetus declara `worlds: ['cetus','earth']` e o front funde o
  rótulo. Nunca reintroduzir o `/earthCycle`.
- **Fissuras agora** - worldstate ao vivo (Normais / Steel Path / Railjack) com contagem regressiva.
- **FAQ** - 20 artigos de mecânica (Helminth, slots, ducats, Forma, platina, vaulted…).
- **Nightwave** - cruza os atos ativos da semana com uma biblioteca de 18 guias em PT-BR (match por
  palavra-chave) e lista os guias recorrentes.
- **Busca unificada** - itens + componentes + relíquias + FAQ + guias, fuzzy e sem acento (tolera
  erro de digitação e PT/EN misturado). Ignora preposições/artigos (de, da, of, the…) para não travar em
  frases ("Sombras de" acha "Sombras da Jade"). Sem resultado local relevante → **fallback de busca web**
  restrita aos sites confiáveis (ver "Chaves do Google").
- **Como conseguir (fora do drop)** - toda página de item mostra as vias que a drop table NÃO cobre:
  **pesquisa no Dojo do clã** (laboratório, custo em créditos, materiais com quantidade, tempo, afinidade
  e pré-requisito), **vendedores** (sindicatos, Cetus/Fortuna, Acrithis, Simaris, Kahl… com moeda, preço,
  quantidade e rank exigido) e o **preço no Mercado do jogo** (platina pelo item, créditos pelo projeto).
  Sai dos módulos de dados da wiki oficial (`Module:Research/data`, `Module:Vendors/data`,
  `Module:Blueprints/data`), lidos na ingestão por um parser de tabela Lua próprio (`server/lua.js`) e
  gravados já invertidos por item na tabela `acquisition` - a página não faz request nenhum para a wiki.
  **1.195 itens** do catálogo ganharam informação que antes não existia em lugar nenhum do site.
- **Moedas e tokens do jogo** - Espinobre (Vainthorn), Vosfor, Corrupted Holokey, Archon Shard e
  companhia. O dataset do WFCD marca tudo isso como `type: "Misc"` **sem `parents`** (não são
  ingrediente de receita nenhuma: gastam-se com um vendedor), e a regra antiga de ingestão exigia ser
  ingrediente - então **117 coisas farmáveis eram invisíveis na busca**. Hoje o critério é ter **local de
  drop**: se o jogo dropa, o site responde "onde consigo". Ver `classifyMisc()` em `server/ingest.js`.
- **Recursos e quests** - recurso de craft sem tabela no dataset (ex.: Orokin Cell) mostra "onde dropa"
  buscado na API de drops do warframestat.us (+ link da wiki). Quests mostram sinopse + link da wiki (o
  dataset oficial não traz requisitos/recompensas estruturados de quest).
- **SEO** - cada item/relíquia/artigo tem uma **URL limpa e estável** (`/item/braton-prime`,
  `/relic/lith-k12`, `/faq/<slug>`, `/nightwave/<slug>`) com `<title>`, meta description, canonical,
  Open Graph/Twitter e JSON-LD **renderizados no servidor** (crawler sem JS já lê o conteúdo essencial -
  h1, drops, recompensas, artigo inteiro); a home tem `WebSite`+`SearchAction` e o FAQ um `FAQPage`.
  `sitemap.xml` é gerado dinâmico (só a página canônica de cada item; gêmeos ficam de fora) e apontado no
  `robots.txt`. As URLs `.html?u=/…` antigas dão **301** para as novas. Detalhe em `server/seo.js`.
- **Preços** (opcional) - menor preço de venda no warframe.market na página do item.

## Stack

Node 22 + Express 5, **SQLite** (better-sqlite3), busca **MiniSearch** em memória, front **vanilla**
(zero framework, render 100% via DOM APIs). Roda em **Docker**, bind `127.0.0.1:3064`, nginx faz o proxy
público com HTTPS. Sem serviços pagos.

```
server/        ingest.js (WFCD→SQLite) · search · seo (URLs limpas/meta SSR/sitemap) · worldstate · nightwave · itemview · websearch · market · routes/api.js
               lua.js (parser de tabela Lua) + wikiacq.js (módulos de dados da wiki → índice) + acquisition.js (leitura p/ a página)
content/       faq/*.md  nightwave/*.md   (fonte dos artigos; frontmatter + markdown)
public/        *.html + js/ (uma pág. por rota, + ads.js) + css/ + og-banner.png + fontes Exo 2 self-hosted
test/          node --test (ingestão, busca, quota CSE, sanitização, SEO/slug/escape)
data/          SQLite + WAL (git-ignored, recriado pela ingestão)
```

**Anúncios:** rails A-ads (iframe isolado, mesma rede/units do Porkfolio) nas calhas laterais em telas
largas (≥1420px) + um bloco em fluxo no mobile - `public/js/ads.js`. A-ads é cookieless (sem banner de
consentimento); o `<iframe>` roda o código do anunciante na origem DELES, então a CSP mantém
`script-src 'self'` e só abre `frame-src acceptable.a-ads.com`.

## Rodar localmente

```bash
cp .env.example .env          # ajuste se quiser (chaves do Google são opcionais)
docker compose up -d --build  # sobe em 127.0.0.1:3064
```

Na **primeira subida** o container roda a ingestão sozinho (baixa os JSONs do WFCD + i18n ~50 MB e popula o
SQLite - alguns minutos). Acompanhe: `docker logs -f warframe-helper`. Quando `GET /api/health` responder
`"ready": true`, está pronto.

## Atualizar os dados (drop tables mudam a cada update do jogo)

A atualização é **diária e automática** (agendada dentro do app, ~07:43 UTC). Para forçar **agora**, sem
reiniciar o servidor:

```bash
docker exec warframe-helper node server/ingest.js
```

A ingestão é **idempotente** (DELETE+INSERT numa transação) - rodar de novo não duplica nada. O índice de
busca detecta a nova ingestão e se reindexa em até 5 min (ou no próximo boot).

A parte que vem da wiki **falha para o lado seguro**: se os módulos não baixarem ou vierem lixo, o índice
sai vazio e a tabela `acquisition` **não é reescrita** (dado velho é melhor que página sem "como
conseguir"). Como qualquer pessoa edita esses módulos, o indexador aplica tetos de tamanho e quantidade
(nome ≤ 80 chars, 12 vendedores por item, 16 materiais por pesquisa) - sem eles, uma edição vandalizada
viraria uma linha de megabytes no banco. Ver `server/wikiacq.js`.

**Duas velocidades de atualização, não confundir:**

| Camada | Fonte | Frequência | O que cobre |
|---|---|---|---|
| **Catálogo** (SQLite) | JSONs do WFCD/warframe-items + módulos de dados da wiki | **1×/dia**, ~07:43 UTC | itens, relíquias, flag vaulted, drop tables, nomes PT, artigos do FAQ, **pesquisa no Dojo / vendedores / preço no Mercado** |
| **Estado do jogo** (memória) | api.warframestat.us | **a cada request**, cache de 90s | fissuras, Nightwave, Baro, ciclos dos mundos, rotação da Varzia (cache 6h) |

Consequência prática: **conteúdo derivado do markdown vive no banco**. Editar `content/**/*.md` só aparece
no site depois de rodar a ingestão - o mesmo vale para qualquer varredura de texto.

## Idiomas

Interface em **pt / en / es / ru / zh** (chinês simplificado). O seletor de bandeiras grava
`localStorage['wfh-lang']`.

**Nome de item por idioma, e por que zh é exceção.** `pt` e `zh` têm nome próprio (`name_pt` /
`name_zh`, do i18n do WFCD); `en/es/ru` usam o nome canônico em inglês, porque é assim que a
comunidade (market, wiki, trade) se refere aos itens nesses idiomas. O chinês é diferente: o
servidor CN do jogo é um ecossistema à parte, com nomenclatura oficial própria (布莱顿 Prime,
突变原聚合物), e é por ela que o jogador de lá procura. São **3.771 nomes** no banco.

**Busca em chinês.** O chinês não separa palavra com espaço, então o tokenizador padrão faria do
nome inteiro um único token e quem digitasse um pedaço não acharia nada. `server/search.js` tem um
`tokenize()` que indexa o trecho CJK **e os bigramas dele** (突变原聚合物 → 突变/变原/原聚/聚合/合物),
então qualquer pedaço de 2+ caracteres casa. A tokenização do alfabeto latino ficou idêntica à de
antes (é o mesmo separador do MiniSearch), e há teste travando isso.

**Idioma pelo país.** Quem abre de um país de língua chinesa (CN/TW/HK/MO/SG) cai direto em zh, mesmo
com o navegador em outro idioma. O país vem do header `CF-IPCountry` do Cloudflare via `/api/geo`
(`no-store`; não é geolocalização do navegador, não pede permissão e nada é gravado). A ordem é
**escolha manual > país > idioma do navegador > pt**, e a dedução por país fica num
`localStorage['wfh-geo-lang']` separado - assim ela nunca se disfarça de escolha do usuário, um
clique na bandeira a apaga, e o reload acontece no máximo uma vez.

**Tipografia CJK.** A Exo 2 (self-hosted) não tem glifo chinês: `--cjk` no `:root` acrescenta as
fontes de SISTEMA por plataforma (o fallback é por caractere, então o latino segue na Exo 2). O
bloco `html[lang^="zh"]` no fim do `style.css` ajusta o que a escrita quebra: `letter-spacing` alto
vira ideograma solto, entrelinha do latino faz as linhas encostarem, 11px vira borrão e o peso 700
sintetizado empastela os traços. Ver o relatório em `.claude/frontend-review/20260814-zh/`.

**O que o cliente chinês NÃO traduz (conferido, não suposto).** Arma, recurso, mod, arcana, gear e
peixe: ~100% em chinês. **Warframe: 98% fica em latim** (Excalibur, Ash, Valkyr Prime) e **nome de nó
de missão idem** (Adaro, Akkad, Candiru) - são nomes próprios. Verificado em duas fontes
independentes: o i18n oficial da DE (via WFCD) e o **warframe.market em `zh-hans`**, que é onde os
traders chineses negociam e que traduz só a palavra "Set" (`Frost Prime 一套`). Ou seja: não é buraco
do site, é como o jogo chama as coisas.

**Local de drop em chinês.** `public/js/places.js` é uma tabela de 3 colunas (en, pt, zh), então
"Venus/Orb Vallis (Level 30 - 50 Orb Vallis Bounty)" sai como
"金星/奥布山谷 (等级 30 - 50 奥布山谷 赏金)". Planeta, região aberta, tipo de missão e termo entram;
**nome de nó fica em latim de propósito**, pelo motivo acima. Os 8 laboratórios do Dojo têm tabela
própria em `acquisition.js` (生物实验室, 化学实验室…).

**Auditoria mecânica de tradução (rode isto, não confie no olho).** Carregue a página no idioma novo
e liste TODO nó de texto que ainda tem palavra do alfabeto de origem:

```js
const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
for (let n = w.nextNode(); n; n = w.nextNode())
  if (/[A-Za-z]{2,}/.test(n.textContent)) console.log(n.textContent.trim());
```

Foi isso que achou, DEPOIS de a página já parecer traduzida: o selo de tipo (`MELEE`), o cabeçalho
`INTACT` cravado no código, o tier da relíquia (`Neo V9`), as peças (`Venka Prime Blades`),
`Steel Path`/`Railjack` concatenados na linha da fissura e o `pl` de platina. O que sobra depois
disso é só nome próprio (Prime, Corpus, Grineer, nó de missão), marca e URL.

**Artigos por idioma.** `content/<kind>/*.md` é o português (origem do conteúdo) e
`content/<kind>/<lang>/*.md` é a tradução, com o MESMO nome de arquivo. A tabela `articles` tem
chave (slug, lang) e **quem lê cai no `pt` quando aquele artigo não foi traduzido** - tradução
parcial nunca esconde conteúdo. O `match` dos guias de Nightwave vive só no artigo pt; a tradução
contribui apenas com o título. Os 39 artigos estão traduzidos para zh.

**Atos do Nightwave traduzidos.** A API do worldstate só devolve inglês, mas **o dataset da DE
traduz os desafios**: o ingest guarda nome e descrição por idioma na tabela `challenges`, e o
casamento é pelo `id` do ato sem o timestamp da semana
("1786752000000seasondailycompletemission" → "seasondailycompletemission"), que é o último segmento
do uniqueName. O `|COUNT|` do texto traduzido é preenchido com o número extraído do texto inglês.
Isso vale para **pt/es/ru/zh** - antes todo mundo via os atos em inglês.

**Limite honesto:** ato de Nightwave novo demais para estar no dataset fica em inglês (é o
comportamento certo: melhor inglês completo que meio traduzido). Nomes de inimigo/boss (Corrupted
Vor) também: vêm como texto solto da tabela de drops, sem id para cruzar com o i18n.

## Analytics (Umami)

O site é medido pelo **Umami** próprio do box (`analytics.bobagi.space`), mas o script **não** é
carregado de lá: o nginx serve `/st.js` e `/st/` a partir da NOSSA origem, apontando para o Umami
local. Duas razões: a CSP daqui é `script-src 'self'` + `connect-src 'self'` e apontar para outro
host obrigaria a afrouxar as duas; e um bloqueador de anúncio que filtra host de analytics pelo nome
não come a medição. Umami é cookieless, então não há banner de consentimento.

Para conferir se está coletando: `docker exec umami-db psql -U umami -d umami -c "SELECT url_path,
created_at FROM website_event WHERE website_id='<id>' ORDER BY created_at DESC LIMIT 5;"`.
**Cuidado ao testar com navegador headless:** o Umami filtra bot pelo user-agent, então
`HeadlessChrome` devolve **200 e não grava** - use um UA de navegador real na sonda.

## Ver logs

```bash
docker logs -f warframe-helper          # app + ingestão + cron
docker logs --tail 100 warframe-helper  # últimas linhas
```

## Chaves do Google (busca web - opcional)

Sem chaves, a busca web **degrada graciosamente**: em vez de quebrar, mostra links prontos de busca por
site confiável (wiki, Overframe, Reddit, market, fóruns). Para ativar resultados reais (Google Programmable
Search Engine / Custom Search JSON API):

1. Crie um **Programmable Search Engine** em https://programmablesearchengine.google.com/ e restrinja aos
   sites: `wiki.warframe.com`, `warframe.com`, `forums.warframe.com`, `warframe.market`, `overframe.gg`,
   `reddit.com/r/Warframe`. Copie o **Search engine ID** → `GOOGLE_CSE_ID`.
2. Ative a **Custom Search API** no Google Cloud e gere uma **API key** → `GOOGLE_API_KEY`.
3. Preencha os dois no `.env` e `docker compose up -d` para recriar o container.

A cota gratuita é ~100 buscas/dia - o app **cacheia** cada busca (3 dias) e respeita um teto diário
(`CSE_DAILY_LIMIT`, default 90); ao estourar, volta aos links prontos.

## Adicionar / editar FAQs e guias de Nightwave

Cada artigo é **um arquivo Markdown** com frontmatter, em `content/faq/` ou `content/nightwave/`:

```markdown
---
title: Pergunta ou nome do ato
keywords: termos, de, busca, extras
order: 25
# só para guias de nightwave - casa o guia com o ato ativo:
match: [["crewship","artillery"],["crewship","artilharia"]]
---

Corpo em **markdown**. Pode linkar outros artigos e a wiki.
```

- `title` é obrigatório. `keywords` melhora a busca. `order` ordena as listas.
- `match` (só Nightwave) é uma lista de **grupos de palavras**: o ato casa com o guia se **todas** as
  palavras de **algum** grupo aparecerem no título+descrição do ato (sem acento, minúsculas). Inclua
  variantes EN e PT porque a API do worldstate manda em inglês.
- O HTML é gerado do markdown **na ingestão**, com HTML cru escapado e links de esquema perigoso removidos
  (seguro para injetar na página).

Depois de criar/editar, rode a ingestão (`docker exec warframe-helper node server/ingest.js`).

## Redeploy (após mudar o código)

```bash
cd /opt/warframe-farm-helper
git pull                       # se veio do GitHub
docker compose up -d --build   # rebuild + recreate; o volume ./data preserva o SQLite
```

Rodar os testes:

```bash
docker compose build && docker compose run --rm --no-deps web npm test
```

> **Atenção:** o compose só monta `./data` como volume - o **código vem da imagem**. `docker compose run`
> executa o código **da última build**, não a working tree. Rode `docker compose build` (ou `up -d --build`)
> **antes** de testar/verificar código novo, senão você valida a versão antiga sem perceber.

## Verificação (o que confirmar depois de subir)

- `curl -I https://warframe.bobagi.space` → `200`, HTTPS válido.
- Buscar **"Braton Prime Stock"** → componente com **Lith K12** e **Lith V11** marcadas *disponível* e as
  demais *vaulted* (isso muda com updates do jogo).
- Buscar **"o que fazer com kubrow"** → artigo do FAQ.
- Buscar **"melhor build saryn 2026"** → fallback web (ou links de busca, sem chave).
- Home mostra **fissuras reais** com contagem regressiva.

## Licença

MIT - ver [LICENSE](LICENSE).
