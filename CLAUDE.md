# CLAUDE.md · warframe-farm-helper

Buscador de farm de Warframe em `https://warframe.bobagi.space` (dono: Gustavo / Bobagi).
Repo PÚBLICO: nada de segredo, senha, IP de origem ou caminho de credencial aqui.
Detalhe técnico completo em [`docs/DEV.md`](docs/DEV.md); fontes de dados no `README.md`.

## Onde roda e como publicar
- Produção: VPS `bobagi.space`, clone em `/opt/warframe-farm-helper`, container `warframe-helper`
  (127.0.0.1:3064, nginx + Cloudflare na frente). Volume `./data` guarda o SQLite.
- Deploy (na VPS): `cd /opt/warframe-farm-helper && git pull && docker compose up -d --build`.
  De outra máquina: commit + push aqui e rodar o deploy via skill `vps` (SSH).
- Testes: `docker compose run --rm --no-deps web npm test` (270, todos devem passar).
- Mudou CSS ou JS de `public/`: trocar o `?v=` nos HTML (o Cloudflare segura o arquivo velho por horas).
- Validar mudança sempre pela URL pública, não só pelo localhost.

## Regras do projeto
- Render no front só por `textContent` (nunca `innerHTML` com dado externo). Dado de WFCD, wiki,
  DE e warframestat é input anônimo: escape, allowlist de esquema em link e TETO de tamanho.
- CSP `script-src 'self'`: nada de script inline ou de host novo sem atualizar a CSP.
- Anúncios (Google AdSense, `ca-pub-5349785075769585`) só carregam DEPOIS do "Aceitar" no banner
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

## ★ TAREFA PENDENTE: anúncios do AdSense não aparecem (aberta em 2026-10-08)

O dono quer os anúncios funcionando. Do lado do site está tudo pronto e verificado em 2026-10-08:
- `ads.txt` correto em `bobagi.space/ads.txt` e `warframe.bobagi.space/ads.txt`;
- meta `google-adsense-account` em todas as páginas (o robô de revisão não aceita o banner, então
  antes não via o AdSense no site);
- após "Aceitar", o `adsbygoogle.js` carrega, o Auto ads está ATIVO para o domínio e o pedido de
  anúncio sai, mas volta `unfilled`. De servidor/headless isso é normal e não prova nada.

O bloqueio provável está NA CONTA: ela nasceu pelo AdMob ("AdMob-limited") e em agosto não tinha a
seção **Sites**. Esta tarefa precisa de um navegador LOGADO na conta Google do dono, e isso só pode
ser feito NA MÁQUINA DELE, com ele presente (nunca automatizar Google logado a partir da VPS).

### Passo a passo para a sessão no PC do dono
1. **Navegador:** usar o Claude in Chrome (extensão no Chrome dele, já logado; no Claude Code,
   `/chrome` para conectar) ou, se não houver, o plugin `chrome-devtools-mcp` (abre um Chrome
   próprio: o dono faz o login na frente dele). Ler a skill do navegador antes do primeiro passo.
   Se o dono pedir 2FA ou senha, ele digita; o Claude nunca digita senha.
2. **Abrir o painel:** https://adsense.google.com (conta do dono). Verificar, nesta ordem:
   - existe o menu **Sites**? Se não, a conta ainda é só AdMob: seguir o upgrade
     (https://support.google.com/adsense/answer/6023158), com o dono confirmando cada passo.
   - em **Sites**, `bobagi.space` está adicionado? Estado: *Pronto*, *Preparando*, *Precisa de
     atenção* ou *Requer revisão*? (o AdSense trabalha com o domínio RAIZ; o warframe é subdomínio
     coberto por ele). Se não estiver, adicionar `bobagi.space`, verificar pelo ads.txt (já está no
     ar) e pedir revisão.
   - **Central de políticas** (Policy center): algum problema ou restrição de anúncio?
   - **Pagamentos**: endereço/PIN/dados fiscais pendentes podem segurar a veiculação.
   - **Anúncios > Por site**: Auto ads ligado para `bobagi.space`.
   - **Privacidade e mensagens**: para Europa/Reino Unido o Google exige CMP certificada; o banner
     próprio cobre o Brasil. Só registrar o que o painel disser, não ativar mensagens sem o dono.
   Links diretos (pub `5349785075769585`):
   - Sites: https://www.google.com/adsense/new/u/0/pub-5349785075769585/sites/list
   - Políticas: https://www.google.com/adsense/new/u/0/pub-5349785075769585/policycenter
3. **Correção do lado do site** (se o painel pedir algo, ex.: conteúdo, política de privacidade,
   aviso de cookies): mudar aqui, rodar os testes, push e deploy pela skill `vps`.
4. **Sem navegador (alternativa só leitura):** na VPS existe
   `python3 /opt/claude-skills/admob/scripts/adsense.py sites|alerts|policy|report`. Precisa de um
   consentimento único: `adsense.py auth-url` → o dono abre logado → cola a URL de
   `localhost:8765/?code=...` → `adsense.py auth-code '<url>'`. Se a API não estiver ativada no
   projeto do Google Cloud, o erro traz o link para ativar.
5. **Fechar a tarefa:** anotar aqui o estado encontrado e o que foi feito (e apagar esta seção
   quando os anúncios estiverem servindo); conferir a veiculação pelo relatório do painel, NUNCA
   clicando em anúncio.
