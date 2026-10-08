# CLAUDE.md · warframe-farm-helper

Buscador de farm de Warframe em `https://warframe.bobagi.space` (dono: Gustavo / Bobagi).
Repo PÚBLICO: nada de segredo, senha, IP de origem ou caminho de credencial aqui.
Detalhe técnico completo em [`docs/DEV.md`](docs/DEV.md); fontes de dados no `README.md`.

## Onde roda e como publicar
- Produção: VPS `bobagi.space`, clone em `/opt/warframe-farm-helper`, container `warframe-helper`
  (127.0.0.1:3064, nginx + Cloudflare na frente). Volume `./data` guarda o SQLite.
- Deploy (na VPS): `cd /opt/warframe-farm-helper && git pull && docker compose up -d --build`.
  De outra máquina: commit + push aqui e rodar o deploy via skill `vps` (SSH).
- Testes: `docker compose run --rm --no-deps web npm test` (275, todos devem passar).
- Mudou CSS ou JS de `public/`: trocar o `?v=` nos HTML (o Cloudflare segura o arquivo velho por horas).
- Validar mudança sempre pela URL pública, não só pelo localhost.

## Regras do projeto
- Render no front só por `textContent` (nunca `innerHTML` com dado externo). Dado de WFCD, wiki,
  DE e warframestat é input anônimo: escape, allowlist de esquema em link e TETO de tamanho.
- CSP `script-src 'self'`: nada de script inline ou de host novo sem atualizar a CSP.
- Anúncios (hoje Adsterra; AdSense `ca-pub-5349785075769585` desligado) só carregam DEPOIS do "Aceitar" no banner
  de cookies (`public/js/ads.js`, LGPD). Não mover o script para o HTML. A meta
  `google-adsense-account` em todas as páginas é a exceção permitida (não carrega nada).
- **Nunca clicar nos próprios anúncios** (nem em teste): clique inválido derruba a conta, que é a
  mesma do AdMob dos apps.
- O site raiz `bobagi.space` (portfolio) só é alterado com pedido explícito do dono.
- Nunca usar o travessão longo (em dash) em texto nenhum.
- Catálogo (WFCD + wiki) reingerido 1x/dia; o formato do WFCD muda sem aviso. Ao ver dado estranho,
  olhar primeiro `docker logs warframe-helper | grep ingest` (`peças resolvidas: X/Y`,
  `i18n aplicado`). O `/api/health` expõe `catalogFresh`.
- Fissuras vêm do worldstate oficial da DE; warframestat.us é reserva (atrasa ~1h).

## Anúncios: Adsterra (desde 2026-10-08); AdSense desligado

- **AdSense reprovado.** Painel conferido em 2026-10-08: pagamentos completos e Central de
  políticas limpa, mas o site `bobagi.space` está "Requer atenção · Conteúdo de baixo valor"
  (análise de 2026-08-30). O AdSense avalia o domínio RAIZ, que é o portfólio. O dono decidiu
  não mexer no portfólio e trocar de rede. O código do AdSense continua no `ads.js` atrás de
  `ADSENSE_ENABLED = false` (e a meta + `ads.txt` seguem no ar, são inofensivos).
- **Adsterra** (painel `beta.publishers.adsterra.com`, login do dono; site id 6108271,
  aprovado na hora). Units ativas: Native Banner, Banner 728x90 e Banner 320x50, SEM
  popunder, social bar, interstitial ou anúncio adulto (não ligar: estragam o site e o SEO).
  Chaves das units em `public/js/ad-frame.js`.
- **Como roda:** depois do "Aceitar" (chave `cookieConsent.v2`), o `ads.js` cria iframes
  `/ad-frame.html?u=b728|b320|native` com `sandbox="allow-scripts allow-popups
  allow-popups-to-escape-sandbox"` (NUNCA `allow-same-origin` nem `allow-top-navigation`).
  A moldura tem CSP própria e solta (rota em `server/index.js`); a página principal continua
  com `script-src` estrito, sem host da Adsterra. Banner no topo (728x90 se a janela tem
  760px ou mais, senão 320x50), nativo antes do rodapé (altura via postMessage, limitada).
- Rede nova de anúncio = bumpar `CONSENT_KEY` e citar na política de privacidade (5 idiomas).
