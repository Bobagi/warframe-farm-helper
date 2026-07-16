# Warframe Farm Helper

**Buscador de farm unificado para Warframe, em português.** Numa busca só responde o que hoje exige
visitar 3+ sites: **onde dropa** qualquer item, se a relíquia está **disponível ou vaulted**, **quais
fissuras do Void estão ativas agora**, um **FAQ de mecânicas** e **guias dos atos do Nightwave** (inclusive
os chatos: destruir Crewship com Artilharia Frontal, enigmas do Duviri, etc.).

🔗 **No ar:** https://warframe.bobagi.space

> Site não-oficial, feito por fã. Sem afiliação com a Digital Extremes. Dados de itens/drops: **WFCD**
> (drop tables oficiais da DE). Estado do jogo: **warframestat.us**. Preços: **warframe.market**.

## O que ele faz

- **Busca no topo de todas as páginas** — barra fixa no cabeçalho (com autocomplete) além da busca grande
  da home, para acesso rápido de qualquer tela.
- **Idioma PT / EN** — toggle no cabeçalho. Detecta o idioma pelo navegador e deixa trocar na mão (persiste).
  Traduz a interface, os **nomes de item** (i18n do WFCD), as missões das fissuras e o **passo a passo**
  (gerado bilíngue no servidor). Os artigos de FAQ/Nightwave são escritos em PT — em modo EN o título e a
  navegação traduzem, mas o corpo do artigo permanece em português (conteúdo da comunidade).
- **Página de item** — árvore de componentes com relíquias (destaque disponível × vaulted), chances
  intact/radiante, requisitos de forja (créditos/tempo/MR), fontes de drop não-relíquia e **passo a passo**
  em linguagem simples. Cobre armas, warframes, **gear/itens de quest** (ex.: Apótico do Anoitecer),
  arcanos e peixes — não só primes.
- **Relíquias** — recompensas por refinamento (Intact→Radiant), onde a relíquia dropa, status vaulted e
  fissuras ativas do tier.
- **Relógios dos mundos** — faixa fixa abaixo do cabeçalho (em todas as páginas) com o ciclo de cada
  mundo que tem dia/noite: **Cetus / Terra** (dia/noite), **Vallis** (quente/frio), **Deimos** (Fass/Vome),
  **Duviri** (humores do Spiral) e **Zariman** (Grineer/Corpus), cada um com contagem regressiva ao vivo.
  O servidor avança o estado localmente pela tabela de durações, então a faixa nunca mostra ciclo vencido —
  mesmo se o worldstate upstream cair.
  **Cetus / Terra num chip só:** desde o Update 38.5 a Terra não tem mais ciclo próprio de 8h — ela segue o
  Cetus/Plains (dia 100min, noite 50min), então carrega **sempre** a mesma info e é mostrada junto. A API
  `/earthCycle` ainda calcula o ciclo legado de 8h e fica dessincronizada do jogo; por isso a Terra vem do
  `cetusCycle` (fonte real da DE) — o ciclo do Cetus declara `worlds: ['cetus','earth']` e o front funde o
  rótulo. Nunca reintroduzir o `/earthCycle`.
- **Fissuras agora** — worldstate ao vivo (Normais / Steel Path / Railjack) com contagem regressiva.
- **FAQ** — 20 artigos de mecânica (Helminth, slots, ducats, Forma, platina, vaulted…).
- **Nightwave** — cruza os atos ativos da semana com uma biblioteca de 18 guias em PT-BR (match por
  palavra-chave) e lista os guias recorrentes.
- **Busca unificada** — itens + componentes + relíquias + FAQ + guias, fuzzy e sem acento (tolera
  erro de digitação e PT/EN misturado). Sem resultado local relevante → **fallback de busca web** restrita
  aos sites confiáveis (ver "Chaves do Google").
- **Preços** (opcional) — menor preço de venda no warframe.market na página do item.

## Stack

Node 22 + Express 5, **SQLite** (better-sqlite3), busca **MiniSearch** em memória, front **vanilla**
(zero framework, render 100% via DOM APIs). Roda em **Docker**, bind `127.0.0.1:3064`, nginx faz o proxy
público com HTTPS. Sem serviços pagos.

```
server/        ingest.js (WFCD→SQLite) · search · worldstate · nightwave · itemview · websearch · market · routes/api.js
content/       faq/*.md  nightwave/*.md   (fonte dos artigos; frontmatter + markdown)
public/        *.html + js/ (uma pág. por rota) + css/ + fontes Exo 2 self-hosted
test/          node --test (ingestão, busca, quota CSE, sanitização)
data/          SQLite + WAL (git-ignored, recriado pela ingestão)
```

## Rodar localmente

```bash
cp .env.example .env          # ajuste se quiser (chaves do Google são opcionais)
docker compose up -d --build  # sobe em 127.0.0.1:3064
```

Na **primeira subida** o container roda a ingestão sozinho (baixa os JSONs do WFCD + i18n ~50 MB e popula o
SQLite — alguns minutos). Acompanhe: `docker logs -f warframe-helper`. Quando `GET /api/health` responder
`"ready": true`, está pronto.

## Atualizar os dados (drop tables mudam a cada update do jogo)

A atualização é **diária e automática** (agendada dentro do app, ~07:43 UTC). Para forçar **agora**, sem
reiniciar o servidor:

```bash
docker exec warframe-helper node server/ingest.js
```

A ingestão é **idempotente** (DELETE+INSERT numa transação) — rodar de novo não duplica nada. O índice de
busca detecta a nova ingestão e se reindexa em até 5 min (ou no próximo boot).

## Ver logs

```bash
docker logs -f warframe-helper          # app + ingestão + cron
docker logs --tail 100 warframe-helper  # últimas linhas
```

## Chaves do Google (busca web — opcional)

Sem chaves, a busca web **degrada graciosamente**: em vez de quebrar, mostra links prontos de busca por
site confiável (wiki, Overframe, Reddit, market, fóruns). Para ativar resultados reais (Google Programmable
Search Engine / Custom Search JSON API):

1. Crie um **Programmable Search Engine** em https://programmablesearchengine.google.com/ e restrinja aos
   sites: `wiki.warframe.com`, `warframe.com`, `forums.warframe.com`, `warframe.market`, `overframe.gg`,
   `reddit.com/r/Warframe`. Copie o **Search engine ID** → `GOOGLE_CSE_ID`.
2. Ative a **Custom Search API** no Google Cloud e gere uma **API key** → `GOOGLE_API_KEY`.
3. Preencha os dois no `.env` e `docker compose up -d` para recriar o container.

A cota gratuita é ~100 buscas/dia — o app **cacheia** cada busca (3 dias) e respeita um teto diário
(`CSE_DAILY_LIMIT`, default 90); ao estourar, volta aos links prontos.

## Adicionar / editar FAQs e guias de Nightwave

Cada artigo é **um arquivo Markdown** com frontmatter, em `content/faq/` ou `content/nightwave/`:

```markdown
---
title: Pergunta ou nome do ato
keywords: termos, de, busca, extras
order: 25
# só para guias de nightwave — casa o guia com o ato ativo:
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

> **Atenção:** o compose só monta `./data` como volume — o **código vem da imagem**. `docker compose run`
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

MIT — ver [LICENSE](LICENSE).
