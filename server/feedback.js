'use strict';

/**
 * Mural da Comunidade: visitantes deixam sugestão, pedido de guia, falha ou
 * comentário, sem cadastro. Tudo aqui parte da premissa de que a entrada é
 * hostil (ver [[third-party-data-needs-caps]]): TETO em tudo - tamanho de cada
 * campo, posts por IP por dia e posts totais por dia - além de dedupe de
 * mensagem repetida. O IP cru nunca é gravado: vira sha256 com um salt local
 * gerado uma única vez e guardado em `meta` (some o banco, some o vínculo).
 *
 * A moderação é reativa: o post entra no ar na hora e o operador esconde ou
 * responde depois pelo server/feedback-admin.js (docker exec). Sem endpoint
 * web de admin de propósito - superfície de ataque a menos.
 */

const crypto = require('node:crypto');
const { getDb, getMeta, setMeta } = require('./db');

const KINDS = new Set(['suggestion', 'guide', 'bug', 'comment']);
const LANGS = new Set(['pt', 'en', 'es', 'ru', 'zh']);

const MSG_MIN = 5;
const MSG_MAX = 1000;
const NICK_MAX = 40;
const PAGE_MAX = 160;
const PER_IP_PER_DAY = 5;
const GLOBAL_PER_DAY = 200; // trava de enchente (botnet variando IP)
const LIST_MAX = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function ipSalt(db) {
  let salt = getMeta(db, 'feedback_ip_salt');
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
    setMeta(db, 'feedback_ip_salt', salt);
  }
  return salt;
}

function hashIp(ip) {
  const db = getDb();
  return crypto.createHash('sha256').update(`${ipSalt(db)}:${ip}`).digest('hex').slice(0, 24);
}

// tira caracteres de controle (mantém \n do textarea) e espaço excedente
const cleanText = (v, max) => String(v == null ? '' : v)
  .replace(/\r\n?/g, '\n')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, max);

/**
 * Caminho interno do site, opcional ("qual página?"). Aceita só caminho
 * absoluto local ("/item/xoris"), nunca "//host" nem esquema - a UI vai
 * renderizar isso como <a href> e o safeHref do cliente é a segunda camada.
 * Quem cola a URL completa do próprio site tem o prefixo aparado.
 */
function cleanPage(v) {
  let s = cleanText(v, 400).split(/\s/)[0] || '';
  s = s.replace(/^https?:\/\/warframe\.bobagi\.space/i, '');
  if (!s) return null;
  if (!/^\/(?!\/)[\x21-\x7e]*$/.test(s)) return null;
  return s.slice(0, PAGE_MAX);
}

/**
 * Valida e grava um post. Retorna {ok:true, post} ou {ok:false, code, status}.
 * `code` é estável e vira chave de i18n no cliente (comm.err<Code>).
 */
function createPost({ kind, nick, message, page, lang, ip }) {
  const db = getDb();
  const k = String(kind || '');
  if (!KINDS.has(k)) return { ok: false, code: 'kind', status: 400 };

  const msg = cleanText(message, MSG_MAX + 1);
  if (msg.length < MSG_MIN) return { ok: false, code: 'short', status: 400 };
  if (msg.length > MSG_MAX) return { ok: false, code: 'long', status: 400 };

  const nickClean = cleanText(nick, NICK_MAX).replace(/\n/g, ' ') || null;
  const pageClean = cleanPage(page);
  const langClean = LANGS.has(String(lang || '')) ? String(lang) : null;

  const now = Date.now();
  const since = now - DAY_MS;
  const ipHash = hashIp(String(ip || 'desconhecido'));

  const globalDay = db.prepare('SELECT COUNT(*) c FROM feedback WHERE created_at > ?').get(since).c;
  if (globalDay >= GLOBAL_PER_DAY) return { ok: false, code: 'rate', status: 429 };

  const mine = db.prepare('SELECT COUNT(*) c FROM feedback WHERE ip_hash = ? AND created_at > ?')
    .get(ipHash, since).c;
  if (mine >= PER_IP_PER_DAY) return { ok: false, code: 'rate', status: 429 };

  const dup = db.prepare(
    'SELECT COUNT(*) c FROM feedback WHERE ip_hash = ? AND message = ? AND created_at > ?'
  ).get(ipHash, msg, since).c;
  if (dup > 0) return { ok: false, code: 'dup', status: 409 };

  const info = db.prepare(`INSERT INTO feedback (kind, nick, message, page, lang, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(k, nickClean, msg, pageClean, langClean, ipHash, now);

  return { ok: true, post: publicPost(db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid)) };
}

/** Projeção pública: NUNCA expõe ip_hash nem hidden. */
function publicPost(row) {
  return {
    id: row.id,
    kind: row.kind,
    nick: row.nick,
    message: row.message,
    page: row.page,
    createdAt: new Date(row.created_at).toISOString(),
    reply: row.reply || null,
    replyAt: row.reply_at ? new Date(row.reply_at).toISOString() : null,
  };
}

/** Lista pública, mais recentes primeiro, com cursor `before` (id). */
function listPosts({ before, limit } = {}) {
  const db = getDb();
  const lim = Math.max(1, Math.min(LIST_MAX, parseInt(limit, 10) || LIST_MAX));
  const b = Number.isInteger(before) && before > 0 ? before : null;
  const rows = b
    ? db.prepare('SELECT * FROM feedback WHERE hidden = 0 AND id < ? ORDER BY id DESC LIMIT ?').all(b, lim + 1)
    : db.prepare('SELECT * FROM feedback WHERE hidden = 0 ORDER BY id DESC LIMIT ?').all(lim + 1);
  const hasMore = rows.length > lim;
  const total = db.prepare('SELECT COUNT(*) c FROM feedback WHERE hidden = 0').get().c;
  return { posts: rows.slice(0, lim).map(publicPost), hasMore, total };
}

module.exports = {
  createPost, listPosts, hashIp, cleanPage, cleanText,
  KINDS, MSG_MIN, MSG_MAX, NICK_MAX, PAGE_MAX, PER_IP_PER_DAY, GLOBAL_PER_DAY,
};
