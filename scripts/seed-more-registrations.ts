// scripts/seed-more-registrations.ts — Insert additional test registrations
// into register_data.db so the Register Data view has variety.
//
// Usage: node --experimental-sqlite scripts/seed-more-registrations.ts

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'db/register_data.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

console.log('=== Seed additional registrations ===');

const names = [
  { first: 'Priya', last: 'Patel', company: 'TechFlow Solutions', country: 'India', city: 'Mumbai', role: 'SALES_REP', dept: 'Sales' },
  { first: 'Raj', last: 'Kumar', company: 'Innovate Labs', country: 'India', city: 'Bengaluru', role: 'SALES_MANAGER', dept: 'Sales' },
  { first: 'Mei', last: 'Chen', company: 'Dragon Trading', country: 'Singapore', city: 'Singapore', role: 'FINANCE_OPERATIONS', dept: 'Finance' },
  { first: 'Carlos', last: 'Santos', company: 'SolTech SA', country: 'Brazil', city: 'São Paulo', role: 'SALES_REP', dept: 'Operations' },
  { first: 'Aisha', last: 'Khan', company: 'Desert Retail', country: 'UAE', city: 'Dubai', role: 'ADMIN', dept: 'Executive' },
  { first: 'Liam', last: 'OBrien', company: 'Emerald Industries', country: 'Ireland', city: 'Dublin', role: 'SALES_REP', dept: 'Sales' },
  { first: 'Sofia', last: 'Rossi', company: 'Bella Corp', country: 'Italy', city: 'Milan', role: 'SALES_MANAGER', dept: 'Sales' },
  { first: 'Yuki', last: 'Tanaka', company: 'Sakura Tech', country: 'Japan', city: 'Tokyo', role: 'FINANCE_OPERATIONS', dept: 'Finance' },
];

let inserted = 0;
for (const n of names) {
  const email = `${n.first.toLowerCase()}.${n.last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`;

  // Skip if already exists
  const exists = db.prepare('SELECT 1 FROM RegisterData WHERE lower(email) = lower(?) LIMIT 1').get(email);
  if (exists) {
    console.log(`  ↳ Skip ${email} (already exists)`);
    continue;
  }

  const fullName = `${n.first} ${n.last}`;
  const daysAgo = Math.floor(Math.random() * 30) + 1;
  const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  const lastLogin = Math.random() > 0.3 ? new Date(Date.now() - Math.floor(Math.random() * daysAgo) * 86400_000).toISOString() : null;
  const loginCount = lastLogin ? Math.floor(Math.random() * 20) + 1 : 0;
  const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  const emailVerified = Math.random() > 0.2 ? 1 : 0;
  const phoneVerified = Math.random() > 0.5 ? 1 : 0;

  db.prepare(`
    INSERT INTO RegisterData (
      userId, firstName, lastName, fullName, email, passwordHash,
      phone, company, jobTitle, department, role,
      city, country, addressLine1, zipCode,
      agreeToTerms, marketingOptIn, productUpdates,
      status, emailVerified, emailVerifiedAt, phoneVerified,
      signupSource, ipAddress, userAgent,
      lastLoginAt, loginCount, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    null,                                    // userId (not in main DB — these are test-only)
    n.first,
    n.last,
    fullName,
    email,
    'scrypt$dummy$hash$placeholder',         // dummy hash — these users can't sign in
    `+${Math.floor(Math.random() * 900 + 100)} ${Math.floor(Math.random() * 9000000 + 1000000)}`,
    n.company,
    ['Sales Rep', 'Manager', 'Director', 'VP'][Math.floor(Math.random() * 4)],
    n.dept,
    n.role,
    n.city,
    n.country,
    `${Math.floor(Math.random() * 999)} Main Street`,
    `${Math.floor(Math.random() * 999999)}`,
    1,  // agreeToTerms
    Math.random() > 0.5 ? 1 : 0,  // marketingOptIn
    Math.random() > 0.4 ? 1 : 0,  // productUpdates
    'ACTIVE',
    emailVerified,
    emailVerified ? createdAt : null,
    phoneVerified,
    'web',
    ip,
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0',
    lastLogin,
    loginCount,
    createdAt,
    new Date().toISOString(),
  );

  const newId = (db.prepare('SELECT id FROM RegisterData WHERE lower(email) = lower(?)').get(email) as any).id;

  // Audit log
  db.prepare(`
    INSERT INTO RegisterAuditLog (registerId, action, fieldName, oldValue, newValue, changedBy, reason, createdAt)
    VALUES (?, 'CREATE', NULL, NULL, ?, 'system', 'Seeded for testing', ?)
  `).run(newId, fullName, createdAt);

  // Add 1-5 activity events
  const eventCount = Math.floor(Math.random() * 5) + 1;
  for (let i = 0; i < eventCount; i++) {
    const dayOff = (i + 1) * Math.floor(Math.random() * 3 + 1);
    const date = new Date(Date.now() - dayOff * 86400_000).toISOString();
    db.prepare(`
      INSERT INTO RegisterActivity (registerId, activityType, description, ipAddress, metadata, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      i === 0 ? 'LOGIN' : ['LOGIN', 'PROFILE_UPDATE', 'LOGIN'][Math.floor(Math.random() * 3)],
      i === 0 ? `User signed in: ${fullName}` : `Profile updated`,
      ip,
      null,
      date,
    );
  }

  inserted++;
  console.log(`  ✓ ${email} (${n.role}, ${n.company}) → id=${newId}`);
}

console.log(`\n✓ Inserted ${inserted} new registrations.`);

const total = (db.prepare('SELECT COUNT(*) AS c FROM RegisterData').get() as any).c;
const activity = (db.prepare('SELECT COUNT(*) AS c FROM RegisterActivity').get() as any).c;
const audit = (db.prepare('SELECT COUNT(*) AS c FROM RegisterAuditLog').get() as any).c;
console.log(`\nFinal counts:`);
console.log(`  RegisterData:     ${total}`);
console.log(`  RegisterActivity: ${activity}`);
console.log(`  RegisterAuditLog: ${audit}`);

db.close();
console.log('\n✅ Done');
