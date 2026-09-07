'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// banco temporário ANTES de qualquer require de server/*
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wfh-fbapi-'));
process.env.DATA_DIR = TMP;
process.env.DB_PATH = path.join(TMP, 'fbapi.db');

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { getDb } = require('../server/db');
const api = require('../server/routes/api');

// A camada HTTP do feedback tem regras próprias que o unit do feedback.js não
// exercita: honeypot com "ok" FALSO, corpo só-JSON (mata CSRF-spam por
// text/plain) e erro de corpo como 4xx (nunca 500). Sobe o router real numa
// porta efêmera e bate nele de verdade.
let server;
let base;

test.before(async () => {
  const app = express();
  app.set('trust proxy', ['loopback', 'uniquelocal']);
  app.use('/api', api);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());

const post = (body, headers = {}) => fetch(`${base}/api/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('honeypot preenchido: responde ok FALSO e não grava nada', async () => {
  const res = await post({ kind: 'comment', message: 'sou um bot e caí na armadilha', website: 'x' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true }); // sem post: o bot não aprende
  const c = getDb().prepare('SELECT COUNT(*) c FROM feedback').get().c;
  assert.equal(c, 0, 'honeypot não pode gravar linha');
});

test('POST válido grava e o GET público não vaza ip_hash/hidden', async () => {
  const res = await post({ kind: 'guide', nick: 'Tenno API', message: 'guia de arcanos por favor' });
  assert.equal(res.status, 201);
  const list = await (await fetch(`${base}/api/feedback`)).json();
  assert.equal(list.total, 1);
  assert.equal(list.posts[0].message, 'guia de arcanos por favor');
  const raw = JSON.stringify(list);
  assert.ok(!raw.includes('ip_hash') && !raw.includes('ipHash') && !raw.includes('hidden'));
});

test('corpo text/plain (CSRF-spam sem preflight) não grava: 400', async () => {
  const before = getDb().prepare('SELECT COUNT(*) c FROM feedback').get().c;
  const res = await post(JSON.stringify({ kind: 'comment', message: 'csrf por text/plain' }),
    { 'Content-Type': 'text/plain' });
  assert.equal(res.status, 400);
  assert.equal(getDb().prepare('SELECT COUNT(*) c FROM feedback').get().c, before);
});

test('JSON malformado é 400 e corpo gigante é 413 - nunca 500', async () => {
  const bad = await post('não é json{{{');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'body');
  const huge = await post({ kind: 'comment', message: 'ok', nick: 'x'.repeat(20000) });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).code, 'body');
});

test('mensagem no teto exato (1000) entra; 1001 é recusada', async () => {
  const fb = require('../server/feedback');
  const ok = await post({ kind: 'comment', message: 'y'.repeat(fb.MSG_MAX) }, { 'X-Forwarded-For': '198.51.100.7' });
  assert.equal(ok.status, 201);
  const too = await post({ kind: 'comment', message: 'z'.repeat(fb.MSG_MAX + 1) }, { 'X-Forwarded-For': '198.51.100.7' });
  assert.equal(too.status, 400);
  assert.equal((await too.json()).code, 'long');
});
