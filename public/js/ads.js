'use strict';

/**
 * Publicidade - Adsterra (e AdSense, desligado), carregada SÓ após
 * consentimento (LGPD/GDPR).
 *
 * Padrão (app-essentials §9): nenhum tag estático de ads no HTML - os anúncios
 * são injetados em runtime apenas quando o visitante ACEITA cookies
 * no banner. "Rejeitar" tem a mesma proeminência e nada de terceiro carrega.
 * O Umami (analytics) é cookieless e self-hosted, então fica fora do gate.
 *
 * Revogação: o rodapé ganha um link "Gerenciar cookies" que reabre o banner;
 * trocar aceite por recusa recarrega a página para derrubar o script já
 * carregado. A CHAVE do consentimento é versionada - mudar as categorias de
 * cookies (ex.: nova rede de ads) = bumpar CONSENT_KEY para todos re-decidirem.
 *
 * Adsterra: cada unit roda num iframe de /ad-frame.html servido por OUTRA
 * origem (AD_FRAME_ORIGIN, vhost próprio no nginx). O script da rede precisa
 * de allow-same-origin (lê document.cookie; sem isso quebra com SecurityError
 * e o anúncio vem vazio), e sendo outro host isso dá a ele cookies próprios,
 * mas nenhum acesso ao DOM, ao localStorage ou à navegação deste site (sem
 * allow-top-navigation). A CSP estrita daqui continua valendo. Os códigos das
 * units ficam em public/js/ad-frame.js.
 *
 * AdSense: DESLIGADO (ADSENSE_ENABLED). O AdSense avalia o domínio RAIZ
 * (bobagi.space, o portfólio) e o reprovou em 2026-08-30 por "conteúdo de
 * baixo valor". Se um dia for aprovado, é só religar a flag.
 * Com o site aprovado e Auto ads LIGADO no painel, o script sozinho
 * já posiciona os anúncios. Units manuais (criadas na UI do AdSense, não há
 * API) entram em SLOTS abaixo - vazio = só Auto ads.
 */

(() => {
  const ADSENSE_ENABLED = false;
  const ADSENSE_CLIENT = 'ca-pub-5349785075769585';
  // v1 = AdSense; v2 = entrou a Adsterra (rede nova: todos decidem de novo)
  const CONSENT_KEY = 'cookieConsent.v2';
  const NATIVE_MAX_HEIGHT = 800;
  const AD_FRAME_ORIGIN = 'https://wfads.bobagi.space';
  const PRIVACY_URL = '/legal/politica-de-privacidade';

  // IDs de unit manuais do AdSense (data-ad-slot). Vazio = nenhum bloco fixo;
  // o Auto ads decide os posicionamentos sozinho.
  const SLOTS = { rail: '', mobile: '' };

  const { el } = App;
  const { t } = I18n;

  const getConsent = () => {
    try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
  };
  const setConsent = (v) => {
    try { localStorage.setItem(CONSENT_KEY, v); } catch { /* modo privado */ }
  };

  const adFrame = (unit, width, height) => el('iframe', {
    src: `${AD_FRAME_ORIGIN}/ad-frame.html?u=${unit}`,
    title: t('ads.label'),
    width: String(width),
    height: String(height),
    loading: 'lazy',
    scrolling: 'no',
    referrerpolicy: 'strict-origin-when-cross-origin',
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    class: 'ad-frame',
  });

  // Banner no topo (728x90 no desktop, 320x50 no celular) e Native Banner
  // antes do rodapé. A altura do banner é reservada para não empurrar o
  // conteúdo quando o anúncio chega (CLS).
  function renderAdsterra() {
    const label = () => el('span', { class: 'ad-label', text: t('ads.label') });
    const header = document.getElementById('site-header');
    if (header) {
      const wide = window.matchMedia('(min-width: 760px)').matches;
      header.after(el('aside', { class: 'ad-slot ad-top', 'aria-label': t('ads.label') }, [
        label(), wide ? adFrame('b728', 728, 90) : adFrame('b320', 320, 50),
      ]));
    }
    const footer = document.getElementById('site-footer');
    if (footer) {
      const native = adFrame('native', '100%', 0);
      window.addEventListener('message', (ev) => {
        if (ev.source !== native.contentWindow || ev.origin !== AD_FRAME_ORIGIN) return;
        const h = Number(ev.data && ev.data.adFrameHeight);
        if (!Number.isFinite(h)) return;
        native.height = String(Math.max(0, Math.min(NATIVE_MAX_HEIGHT, Math.round(h))));
      });
      footer.before(el('aside', { class: 'ad-slot ad-native wrap', 'aria-label': t('ads.label') }, [
        label(), native,
      ]));
    }
  }

  let adsLoaded = false;
  function loadAds() {
    if (adsLoaded) return;
    adsLoaded = true;
    renderAdsterra();
    if (ADSENSE_ENABLED) loadAdsense();
  }

  function loadAdsense() {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.appendChild(s);
    renderManualUnits();
  }

  const adIns = (slot, style) => {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.cssText = style;
    ins.dataset.adClient = ADSENSE_CLIENT;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    return ins;
  };

  function renderManualUnits() {
    const label = () => el('span', { class: 'ad-label', text: t('ads.label') });
    if (SLOTS.rail) {
      for (const side of ['left', 'right']) {
        document.body.append(el('aside', { class: `ad-rail ${side}`, 'aria-label': t('ads.label') }, [
          label(), adIns(SLOTS.rail, 'display:block;width:160px;height:600px'),
        ]));
      }
    }
    const footer = document.getElementById('site-footer');
    if (SLOTS.mobile && footer) {
      footer.parentNode.insertBefore(
        el('aside', { class: 'ad-mobile', 'aria-label': t('ads.label') }, [
          label(), adIns(SLOTS.mobile, 'display:block'),
        ]),
        footer
      );
    }
    document.querySelectorAll('ins.adsbygoogle').forEach(() => {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  }

  function showBanner() {
    if (document.getElementById('cookie-banner')) return;
    const decide = (v) => {
      const had = getConsent();
      setConsent(v);
      document.getElementById('cookie-banner')?.remove();
      if (v === 'accepted') loadAds();
      // já tinha aceitado e agora recusou: recarrega p/ derrubar o script
      else if (had === 'accepted' || adsLoaded) location.reload();
    };
    document.body.append(el('div', {
      id: 'cookie-banner', class: 'cookie-banner', role: 'dialog',
      'aria-live': 'polite', 'aria-label': t('cookies.aria'),
    }, [
      el('p', {}, [
        t('cookies.msg') + ' ',
        el('a', { href: PRIVACY_URL, text: t('cookies.privacy') }),
      ]),
      el('div', { class: 'cookie-actions' }, [
        el('button', { type: 'button', class: 'cookie-btn', onclick: () => decide('accepted'), text: t('cookies.accept') }),
        el('button', { type: 'button', class: 'cookie-btn', onclick: () => decide('rejected'), text: t('cookies.reject') }),
      ]),
    ]));
  }

  // link "Gerenciar cookies" no rodapé (o layout.js já montou o #site-footer)
  const footWrap = document.querySelector('#site-footer .wrap');
  if (footWrap) {
    footWrap.append(el('p', {}, [
      el('a', { href: PRIVACY_URL, text: t('cookies.privacy') }), ' · ',
      el('a', {
        href: '#', text: t('cookies.manage'),
        onclick: (ev) => { ev.preventDefault(); showBanner(); },
      }),
    ]));
  }

  const consent = getConsent();
  if (consent === 'accepted') loadAds();
  else if (consent !== 'rejected') showBanner();
})();
