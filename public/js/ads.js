'use strict';

/**
 * Publicidade - Google AdSense, carregado SÓ após consentimento (LGPD/GDPR).
 *
 * Padrão (app-essentials §9): nenhum tag estático de ads no HTML - o script
 * do AdSense é injetado em runtime apenas quando o visitante ACEITA cookies
 * no banner. "Rejeitar" tem a mesma proeminência e nada de terceiro carrega.
 * O Umami (analytics) é cookieless e self-hosted, então fica fora do gate.
 *
 * Revogação: o rodapé ganha um link "Gerenciar cookies" que reabre o banner;
 * trocar aceite por recusa recarrega a página para derrubar o script já
 * carregado. A CHAVE do consentimento é versionada - mudar as categorias de
 * cookies (ex.: nova rede de ads) = bumpar CONSENT_KEY para todos re-decidirem.
 *
 * AdSense: com o site aprovado e Auto ads LIGADO no painel, o script sozinho
 * já posiciona os anúncios. Units manuais (criadas na UI do AdSense, não há
 * API) entram em SLOTS abaixo - vazio = só Auto ads.
 */

(() => {
  const ADSENSE_CLIENT = 'ca-pub-5349785075769585';
  const CONSENT_KEY = 'cookieConsent.v1'; // v1 = categoria "publicidade" (AdSense)
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

  let adsenseLoaded = false;
  function loadAdsense() {
    if (adsenseLoaded) return;
    adsenseLoaded = true;
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
      if (v === 'accepted') loadAdsense();
      // já tinha aceitado e agora recusou: recarrega p/ derrubar o script
      else if (had === 'accepted' || adsenseLoaded) location.reload();
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
  if (consent === 'accepted') loadAdsense();
  else if (consent !== 'rejected') showBanner();
})();
