// scripts/seed-register-activity.ts — Backfill RegisterActivity rows for
// existing RegisterData records so the activity log isn't empty.
//
// Usage: node --experimental-sqlite scripts/seed-register-activity.ts

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'db/register_data.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== Seed RegisterActivity ===');

const registers = db.prepare('SELECT id, fullName, email, createdAt, lastLoginAt, loginCount FROM RegisterData').all() as any[];

let inserted = 0;
for (const r of registers) {
  // If loginCount is 0 and lastLoginAt is null, simulate 1-3 login events.
  const eventCount = r.loginCount > 0 ? r.loginCount : Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < eventCount; i++) {
    const daysAgo = (eventCount - i) * 2 + Math.floor(Math.random() * 3);
    const date = new Date(Date.now() - daysAgo * 86400_000).toISOString();
    const ip = `192.168.1.${Math.floor(Math.random() * 254) + 1}`;
    const types = ['LOGIN', 'PROFILE_VIEW', 'LOGIN', 'LOGIN'];
    const type = types[Math.floor(Math.random() * types.length)];

    db.prepare(`
      INSERT INTO RegisterActivity (registerId, activityType, description, ipAddress, metadata, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      r.id,
      type,
      type === 'LOGIN' ? `User signed in: ${r.fullName}` : `Viewed profile`,
      ip,
      JSON.stringify({ userAgent: 'Chrome/120.0', sessionId: 'sess_' + Math.random().toString(36).slice(2, 8) }),
      date,
    );
    inserted++;
  }

  // Update loginCount + lastLoginAt if they were 0/null.
  if (r.loginCount === 0) {
    const lastDate = new Date(Date.now() - 86400_000).toISOString();
    db.prepare('UPDATE RegisterData SET loginCount = ?, lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(
      eventCount,
      lastDate,
      new Date().toISOString(),
      r.id,
    );
    console.log(`  ✓ ${r.email}: ${eventCount} activity events added, loginCount=${eventCount}`);
  } else {
    console.log(`  ↳ ${r.email}: already has ${r.loginCount} logins, added ${eventCount} events`);
  }
}

console.log(`\n✓ Inserted ${inserted} activity rows across ${registers.length} registrations.`);

// Show summary
const total = (db.prepare('SELECT COUNT(*) AS c FROM RegisterActivity').get() as any).c;
console.log(`Total RegisterActivity rows: ${total}`);

db.close();
console.log('✅ Done');
