// scripts/init-register-data-db.ts — Create + initialize register_data.db
//
// Usage:  node --experimental-sqlite scripts/init-register-data-db.ts
//
// Creates db/register_data.db from db/register-data-schema.sql. Idempotent.
// Also migrates any existing registrations from logic_details_db into the
// new register_data_db so you don't lose existing sign-ups.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const newDbPath = resolve(projectRoot, 'db/register_data.db');
const oldDbPath = resolve(projectRoot, 'db/logic_details.db');
const schemaPath = resolve(projectRoot, 'db/register-data-schema.sql');

mkdirSync(dirname(newDbPath), { recursive: true });

const db = new DatabaseSync(newDbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== register_data_db Initialization ===');
console.log(Database: ${newDbPath});
console.log(Schema:   ${schemaPath});
console.log('');

const sql = readFileSync(schemaPath, 'utf-8');
try {
  db.exec(sql);
} catch (err: any) {
  console.error('Schema execution failed:', err.message);
  process.exit(1);
}
console.log('✓ Schema executed');
console.log('');

// Show created tables
const tables = db
  .prepare(
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name,
  )
  .all() as { name: string }[];

const views = db
  .prepare(SELECT name FROM sqlite_master WHERE type='view' ORDER BY name)
  .all() as { name: string }[];

console.log(Tables (${tables.length}):);
for (const t of tables) {
  const count = db.prepare(SELECT COUNT(*) AS c FROM "${t.name}").get() as { c: number };
  console.log(  • ${t.name.padEnd(22)} ${count.c} rows);
}
console.log('');
console.log(Views (${views.length}):);
for (const v of views) console.log(  • ${v.name});

// Migrate existing registrations from logic_details_db if it exists.
if (existsSync(oldDbPath)) {
  console.log('');
  console.log('=== Migrating from logic_details_db ===');
  const oldDb = new DatabaseSync(oldDbPath);
  try {
    const oldRows = oldDb
      .prepare('SELECT * FROM RegistrationDetails ORDER BY createdAt ASC')
      .all() as any[];
    console.log(Found ${oldRows.length} existing registration(s) to migrate.);

    let migrated = 0;
    for (const old of oldRows) {
      // Skip if email already exists in new db.
      const existing = db
        .prepare('SELECT 1 FROM RegisterData WHERE lower(email) = lower(?) LIMIT 1')
        .get(old.email);
      if (existing) {
        console.log(  ↳ Skip ${old.email} (already exists));
        continue;
      }

      const fullName = old.fullName  `${old.fullName  ''}`.trim();
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] ?? fullName;
      const lastName = nameParts.slice(1).join(' ') || null;

      db.prepare(`
        INSERT INTO RegisterData (
          userId, firstName, lastName, fullName, email, passwordHash,
          phone, company, jobTitle, role, customerId,
          city, country, addressLine1, zipCode,
          agreeToTerms, marketingOptIn,
          status, signupSource, ipAddress, userAgent,
          createdAt, updatedAt, lastLoginAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        old.userId,
        firstName,
        lastName,
        fullName,
        old.email,
        old.passwordHash,
        old.phone,
        old.company,
        old.jobTitle,
        old.role,
        old.customerId,
        old.city,
        old.country,
        old.address,
        old.zipCode,
        old.agreeToTerms ? 1 : 0,
        old.marketingOptIn ? 1 : 0,
        old.status ?? 'ACTIVE',
        old.signupSource ?? 'web',
        old.ipAddress,
        old.userAgent,
        old.createdAt,
        old.updatedAt,
        old.lastLoginAt,
      );