'use strict';

/**
 * Publicidade - A-ads (aads.com), a MESMA rede/units do Coin Hub.
 *
 * Por que A-ads: o ad unit é um <iframe> puro - nenhum JavaScript de terceiro
 * roda na NOSSA página (o código do anunciante fica isolado na origem do
 * iframe), então o CSP continua com script-src 'self' e só libera o host do
 * frame em frame-src (server/index.js). A rede também é cookieless (não seta
 * cookies nem rastreia usuários), por isso não exige banner de consentimento
 * LGPD - diferente de AdSense e afins.
 *
 * Placements (espelham o AdRails do Coin Hub):
 *  - Desktop (≥1420px): dois skyscrapers 160x600 fixos nas calhas laterais
 *    vazias (o .wrap tem 1060px → sobra ≥180px de calha em cada lado).
 *  - Mobile/estreito (<1420px): um 300x250 em fluxo, imediatamente antes do
 *    rodapé - nunca cobre navegação, só rola com a página.
 * O id pode repetir nos dois rails (ganhos idênticos; unit extra só compraria
 * estatística por slot). String vazia desliga o placement.
 */

(() => {
  const A_ADS_HOST = 'acceptable.a-ads.com';
  const AD_UNITS = { left: '2446812', right: '2446812', mobile: '2446824' };

  const { el } = App;
  const { t } = I18n;

  const unitSrc = (id) => `https://${A_ADS_HOST}/${id}/?size=Adaptive`;

  const frame = (id, w, h) => el('iframe', {
    class: 'ad-frame',
    title: t('ads.label'),
    'data-aa': id,
    src: unitSrc(id),
    width: String(w),
    height: String(h),
    loading: 'lazy',
    scrolling: 'no',
    frameborder: '0',
  });

  const label = () => el('span', { class: 'ad-label', text: t('ads.label') });

  for (const side of ['left', 'right']) {
    if (!AD_UNITS[side]) continue;
    document.body.append(el('aside', { class: `ad-rail ${side}`, 'aria-label': t('ads.label') }, [
      label(), frame(AD_UNITS[side], 160, 600),
    ]));
  }

  const footer = document.getElementById('site-footer');
  if (AD_UNITS.mobile && footer) {
    footer.parentNode.insertBefore(
      el('aside', { class: 'ad-mobile', 'aria-label': t('ads.label') }, [
        label(), frame(AD_UNITS.mobile, 300, 250),
      ]),
      footer
    );
  }
})();
