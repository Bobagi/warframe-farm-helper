'use strict';

/**
 * Leitura da tabela `articles`, que tem uma linha por (slug, idioma).
 *
 * Regra única em todo o site: **serve o idioma pedido e cai no `pt` quando
 * aquele artigo ainda não foi traduzido**. Assim uma tradução parcial nunca
 * esconde conteúdo - o leitor vê o artigo em português em vez de um 404.
 */

const { getDb } = require('./db');

/** Idioma válido para consulta (o resto do site já normaliza, isto é o cinto). */
const normLang = (l) => (/^[a-z]{2}$/.test(String(l || '')) ? String(l) : 'pt');

/**
 * Lista os artigos de um tipo, um por slug, preferindo o idioma pedido.
 * O `ORDER BY (lang = ?) DESC` põe a tradução na frente e o GROUP BY fica com
 * a primeira linha de cada slug - é o fallback resolvido no próprio SQL.
 */
function listArticles(kind, lang, extraCols = '') {
  const l = normLang(lang);
  const cols = ['slug', 'lang', 'kind', 'title', 'keywords', 'sort'].concat(
    extraCols ? extraCols.split(',').map((c) => c.trim()) : []
  ).map((c) => `a.${c}`).join(', ');
  // O fallback é explícito com NOT EXISTS, e não com ORDER BY + GROUP BY: num
  // GROUP BY o SQLite escolhe a linha do grupo de forma NÃO especificada (na
  // prática a última), então o "ordena a tradução primeiro" devolvia o pt.
  return getDb().prepare(
    `SELECT ${cols} FROM articles a
      WHERE a.kind = ?
        AND (a.lang = ?
             OR (a.lang = 'pt'
                 AND NOT EXISTS (SELECT 1 FROM articles b
                                  WHERE b.slug = a.slug AND b.lang = ?)))
      ORDER BY a.sort, a.title`
  ).all(kind, l, l);
}

/** Um artigo pelo slug, no idioma pedido (ou em pt). */
function getArticle(slug, lang, kind = null) {
  const l = normLang(lang);
  const db = getDb();
  const base = 'SELECT slug, lang, kind, title, html FROM articles WHERE slug = ? AND lang = ?';
  const sql = kind ? `${base} AND kind = ?` : base;
  const args = (k) => (kind ? [slug, k, kind] : [slug, k]);
  // idioma pedido; se não houver tradução, o português (a origem do conteúdo)
  return db.prepare(sql).get(...args(l)) || db.prepare(sql).get(...args('pt')) || null;
}

module.exports = { listArticles, getArticle, normLang };
