const { spawnSync } = require('node:child_process');

class Statement {
  constructor(databasePath, sql) {
    this.databasePath = databasePath;
    this.sql = sql;
  }

  run(...params) {
    const rows = invoke(this.databasePath, `${this.sql}; SELECT changes() AS changes;`, params, true);
    return { changes: rows[0]?.changes ?? 0 };
  }

  get(...params) {
    const rows = invoke(this.databasePath, this.sql, params, true);
    return rows[0];
  }

  all(...params) {
    return invoke(this.databasePath, this.sql, params, true);
  }
}

class Database {
  constructor(filename) {
    this.filename = filename;
  }

  prepare(sql) {
    return new Statement(this.filename, sql);
  }

  pragma(value) {
    return invoke(this.filename, `PRAGMA ${value.replace(/;$/, '')};`, [], true);
  }

  exec(sql) {
    invoke(this.filename, sql, [], false);
  }
}

function invoke(databasePath, sql, params, jsonMode) {
  const args = [databasePath];
  if (jsonMode) args.push('-json');
  const script = `${buildParamScript(params)}\n${sql.trim().endsWith(';') ? sql : `${sql};`}\n`;
  const result = spawnSync('sqlite3', args, { input: script, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || '').trim() || `sqlite3 exited with code ${String(result.status)}`);
  }
  if (!jsonMode) return [];
  const out = (result.stdout || '').trim();
  return out.length === 0 ? [] : JSON.parse(out);
}

function buildParamScript(params) {
  const lines = ['.parameter clear'];
  params.forEach((value, index) => {
    lines.push(`.parameter set ?${index + 1} ${formatParam(value)}`);
  });
  return lines.join('\n');
}

function formatParam(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Uint8Array) return `x'${Buffer.from(value).toString('hex')}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

module.exports = Database;
