'use strict';

/**
 * Preços do warframe.market (API pública v2) com cache no SQLite -
 * nice-to-have: "ou compre de outro jogador por ~X platina".
 */

const { getDb } = require('./db');
const { nowSec, USER_AGENT } = require('./util');

const TTL_OK_SEC = 15 * 60;
const TTL_MISS_SEC = 6 * 3600;
const SLUG_RE = /^[a-z0-9_]{2,80}$/;

async function getTopOrders(slug) {
  if (!SLUG_RE.test(slug)) return { error: 'slug inválido' };
  const db = getDb();
  const row = db.prepare('SELECT data, fetched_at FROM market_cache WHERE slug = ?').get(slug);
  if (row) {
    const data = JSON.parse(row.data);
    const ttl = data && data.notFound ? TTL_MISS_SEC : TTL_OK_SEC;
    if (nowSec() - row.fetched_at < ttl) return data;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(`https://api.warframe.market/v2/orders/item/${slug}/top`, {
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json', 'User-Agent': USER_AGENT,
          Platform: 'pc', Language: 'en',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    let out;
    if (res.status === 404) {
      out = { notFound: true };
    } else if (!res.ok) {
      throw new Error(`market HTTP ${res.status}`);
    } else {
      const body = await res.json();
      const sell = ((body.data && body.data.sell) || [])
        .map((o) => ({
          platinum: o.platinum,
          quantity: o.quantity,
          user: o.user ? o.user.ingameName : null,
          status: o.user ? o.user.status : null,
        }))
        .filter((o) => Number.isFinite(o.platinum))
        .sort((a, b) => a.platinum - b.platinum);
      out = {
        slug,
        minSell: sell.length ? sell[0].platinum : null,
        sell: sell.slice(0, 5),
        url: `https://warframe.market/items/${slug}`,
      };
    }
    db.prepare('INSERT OR REPLACE INTO market_cache(slug, data, fetched_at) VALUES (?, ?, ?)')
      .run(slug, JSON.stringify(out), nowSec());
    return out;
  } catch {
    if (row) return JSON.parse(row.data); // velho é melhor que nada
    return { error: 'warframe.market indisponível agora' };
  }
}

module.exports = { getTopOrders };
