// scripts/purge-temp-db.ts — Purge expired records from the temp database.
//
// Usage:  node --experimental-sqlite scripts/purge-temp-db.ts
//
// Deletes all rows whose expiresAt <= now. Safe to run on a cron.

import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '..', 'db/temp.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== DealFlow360 Temp DB Purge ===');
console.log(`Database: ${dbPath}`);
console.log('');

const tables = ['TempCustomer', 'TempProduct', 'TempQuote', 'TempSession', 'TempLog', 'TempCache'];
let totalPurged = 0;

for (const table of tables) {
  const result = db.prepare(`DELETE FROM "${table}" WHERE "expiresAt" <= datetime('now')`).run();
  console.log(`  • ${table.padEnd(16)} ${result.changes} row(s) purged`);
  totalPurged += result.changes;
}

console.log('');
console.log(`✓ Total purged: ${totalPurged} row(s)`);

// Show remaining counts
console.log('');
console.log('Remaining counts:');
for (const table of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number };
  console.log(`  • ${table.padEnd(16)} ${count.c} row(s)`);
}

db.close();
console.log('');
console.log('✅ Purge complete');
