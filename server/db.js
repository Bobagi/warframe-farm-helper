'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'warframe.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  unique_name TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_pt     TEXT,
  category    TEXT NOT NULL,
  type        TEXT,
  mastery_req INTEGER,
  vaulted     INTEGER,
  image_name  TEXT,
  wiki_url    TEXT,
  tradable    INTEGER NOT NULL DEFAULT 0,
  raw         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

CREATE TABLE IF NOT EXISTS relics (
  name    TEXT PRIMARY KEY,
  tier    TEXT NOT NULL,
  code    TEXT NOT NULL,
  vaulted INTEGER NOT NULL,
  drops   TEXT NOT NULL,
  rewards TEXT NOT NULL
);

-- índice reverso "usado para construir": mapeia um item que é COMPONENTE de
-- outro (ex.: Furis) ao produto que o consome (ex.: Afuris). Populado na
-- ingestão a partir dos components de cada item.
CREATE TABLE IF NOT EXISTS crafting_uses (
  component_unique TEXT NOT NULL,
  product_unique   TEXT NOT NULL,
  product_name     TEXT NOT NULL,
  item_count       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (component_unique, product_unique)
);
CREATE INDEX IF NOT EXISTS idx_crafting_uses_comp ON crafting_uses(component_unique);

CREATE TABLE IF NOT EXISTS articles (
  slug       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  keywords   TEXT,
  match_json TEXT,
  html       TEXT NOT NULL,
  body_md    TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS web_cache (
  qhash      TEXT PRIMARY KEY,
  query      TEXT NOT NULL,
  results    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_cache (
  slug       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- requisitos/recompensas de quest, extraídos do QuestInfobox da wiki (on-demand,
-- cacheados por muito tempo — dado de quest praticamente não muda).
CREATE TABLE IF NOT EXISTS quest_info (
  unique_name TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}

function getMeta(d, key) {
  const row = d.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(d, key, value) {
  d.prepare(
    'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

module.exports = { getDb, getMeta, setMeta, DB_PATH, DATA_DIR };
