// scripts/init-temp-db.ts — Create and initialize the temp database.
//
// Usage:  node --experimental-sqlite scripts/init-temp-db.ts   (or)
//         bun run scripts/init-temp-db.ts   (Bun 1.4+ / Node 22+)
//
// Creates db/temp.db (SQLite) from db/temp-schema.sql. Idempotent —
// safe to run repeatedly (DROP IF EXISTS handles it).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const dbPath = resolve(projectRoot, 'db/temp.db');
const schemaPath = resolve(projectRoot, 'db/temp-schema.sql');

// Ensure db directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== DealFlow360 Temp DB Initialization ===');
console.log(Database: ${dbPath});
console.log(Schema:   ${schemaPath});
console.log('');

const sql = readFileSync(schemaPath, 'utf-8');

// Execute the schema. SQLite's exec() can handle multiple statements
// separated by semicolons, so we just run the whole file at once.
let executed = 0;
try {
  db.exec(sql);
  executed = sql.split(';').filter((s) => s.trim().length > 0 && !s.trim().startsWith('--')).length;
} catch (err: any) {
  console.error('Schema execution failed:', err.message);
  process.exit(1);
}

console.log(✓ ${executed} statements executed);
console.log('');

// Show the created tables
const tables = db
  .prepare(
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name,
  )
  .all() as { name: string }[];

const views = db
  .prepare(SELECT name FROM sqlite_master WHERE type='view' ORDER BY name)
  .all() as { name: string }[];

console.log(Tables (${tables.length}):);
for (const t of tables) {
  const count = db.prepare(SELECT COUNT(*) AS c FROM "${t.name}").get() as { c: number };
  console.log(  • ${t.name.padEnd(20)} ${count.c} rows);
}
console.log('');
console.log(Views (${views.length}):);
for (const v of views) console.log(  • ${v.name});

// Insert a sample temp record to prove it works
const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const sampleId = 'tmp_' + Math.random().toString(36).slice(2, 10);

db.prepare(
  INSERT INTO TempCustomer (id, name, tier, email, currency, active, expiresAt) VALUES (?, ?, ?, ?, 'INR', 1, ?),
).run(sampleId, 'Sample Temp Customer', 'GOLD', 'sample@temp.io', expires);

console.log('');
console.log(✓ Sample TempCustomer inserted: ${sampleId});
console.log(  expires at: ${expires});

db.close();
console.log('');
console.log('✅ Temp database ready at:', dbPath);