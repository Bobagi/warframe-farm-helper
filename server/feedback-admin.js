'use strict';

/**
 * Moderação do mural da Comunidade - roda DENTRO do container (mesmo volume
 * ./data), sem endpoint web de propósito:
 *
 *   docker exec warframe-helper node server/feedback-admin.js list [--all]
 *   docker exec warframe-helper node server/feedback-admin.js show <id>
 *   docker exec warframe-helper node server/feedback-admin.js hide <id>
 *   docker exec warframe-helper node server/feedback-admin.js unhide <id>
 *   docker exec warframe-helper node server/feedback-admin.js del <id>
 *   docker exec warframe-helper node server/feedback-admin.js reply <id> "texto da resposta"
 *
 * `hide` tira do ar mantendo o registro (dá para voltar atrás); `del` apaga de
 * vez. `reply` publica a "resposta do site" exibida sob o post (aspas no shell:
 * o texto inteiro é UM argumento). A lista pública atualiza na hora - o GET é
 * no-store, sem cache para invalidar.
 */

const { getDb } = require('./db');

const db = getDb();
const [cmd, idArg, ...rest] = process.argv.slice(2);
const id = parseInt(idArg, 10);

const fmt = (r) => {
  const when = new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ');
  const flags = r.hidden ? ' [OCULTO]' : '';
  const head = `#${r.id} ${when} ${r.kind} (${r.lang || '?'}) ${r.nick || 'Tenno'}${flags}`;
  const body = r.message.replace(/\n/g, '\n    ');
  const page = r.page ? `\n    página: ${r.page}` : '';
  const reply = r.reply ? `\n    ↳ resposta: ${r.reply.replace(/\n/g, '\n      ')}` : '';
  return `${head}\n    ${body}${page}${reply}`;
};

function need(ok, msg) {
  if (!ok) {
    console.error(msg);
    process.exit(1);
  }
}

switch (cmd) {
  case 'list': {
    const all = idArg === '--all';
    const rows = db.prepare(
      `SELECT * FROM feedback ${all ? '' : 'WHERE hidden = 0'} ORDER BY id DESC LIMIT 100`
    ).all();
    if (!rows.length) console.log('(nenhuma mensagem)');
    for (const r of rows) console.log(fmt(r), '\n');
    break;
  }
  case 'show': {
    need(Number.isInteger(id), 'uso: show <id>');
    const r = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
    need(r, `#${id} não existe`);
    console.log(fmt(r));
    break;
  }
  case 'hide':
  case 'unhide': {
    need(Number.isInteger(id), `uso: ${cmd} <id>`);
    const n = db.prepare('UPDATE feedback SET hidden = ? WHERE id = ?')
      .run(cmd === 'hide' ? 1 : 0, id).changes;
    need(n > 0, `#${id} não existe`);
    console.log(`#${id} ${cmd === 'hide' ? 'oculto' : 'de volta ao ar'}`);
    break;
  }
  case 'del': {
    need(Number.isInteger(id), 'uso: del <id>');
    const n = db.prepare('DELETE FROM feedback WHERE id = ?').run(id).changes;
    need(n > 0, `#${id} não existe`);
    console.log(`#${id} apagado`);
    break;
  }
  case 'reply': {
    const text = rest.join(' ').trim();
    need(Number.isInteger(id) && text, 'uso: reply <id> "texto"');
    const n = db.prepare('UPDATE feedback SET reply = ?, reply_at = ? WHERE id = ?')
      .run(text.slice(0, 1000), Date.now(), id).changes;
    need(n > 0, `#${id} não existe`);
    console.log(`#${id} respondido`);
    break;
  }
  default:
    console.log('comandos: list [--all] | show <id> | hide <id> | unhide <id> | del <id> | reply <id> "texto"');
}
