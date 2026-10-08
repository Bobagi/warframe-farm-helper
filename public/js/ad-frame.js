'use strict';

/**
 * Roda DENTRO do iframe sandbox de anúncio (/ad-frame.html?u=<unit>).
 *
 * Os códigos da Adsterra (painel > Websites > GET CODE) usam uma variável
 * global `atOptions` + script inline, o que a CSP estrita da página principal
 * não permite e que colidiria com dois banners na mesma página. Aqui cada
 * unit tem o próprio documento, então o global é seguro, e o sandbox (sem
 * allow-same-origin) impede o script da rede de mexer no site.
 */

(() => {
  const HOST = 'https://bauval.org';
  const UNITS = {
    b728: { key: 'db90d3c6eae577f180e6562fb899d0f5', width: 728, height: 90 },
    b320: { key: '9b22d427361c3dfef59d32f7ada2dff6', width: 320, height: 50 },
    native: { key: '0ed4caf171112899bc8b81886043c660', native: true },
  };

  const unit = UNITS[new URLSearchParams(location.search).get('u')];
  if (!unit) return;

  if (!unit.native) {
    window.atOptions = { key: unit.key, format: 'iframe', height: unit.height, width: unit.width, params: {} };
    // document.write síncrono: o invoke da Adsterra espera rodar durante o
    // parse, logo depois do atOptions (como no snippet oficial).
    document.write(`<script src="${HOST}/22/${unit.key}"><\/script>`);
    return;
  }

  // Native Banner: altura variável. Avisa a página-mãe a cada mudança para
  // ela ajustar o iframe (o ads.js limita o valor e confere a origem da msg).
  const box = document.createElement('div');
  box.id = `container-${unit.key}`;
  document.body.append(box);
  const s = document.createElement('script');
  s.async = true;
  s.dataset.cfasync = 'false';
  s.src = `${HOST}/21/${unit.key}`;
  document.body.append(s);

  const report = () => parent.postMessage({ adFrameHeight: document.body.scrollHeight }, '*');
  new ResizeObserver(report).observe(document.body);
})();
