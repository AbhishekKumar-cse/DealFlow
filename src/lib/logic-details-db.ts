// src/lib/logic-details-db.ts — Singleton accessor for the logic_details_db.
//
// This is a SEPARATE SQLite database from the main app DB. It stores user
// registration details. Accessed via Node's built-in node:sqlite (no Prisma)
// because the schema is intentionally minimal + decoupled.
//
// Server-side only. Never import this from a client component.

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'db/logic_details.db');

let _db: DatabaseSync | null = null;

/** Get a singleton connection to logic_details.db. */
export function getLogicDetailsDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  _db = db;
  return db;
}

export interface RegistrationDetails {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  role: string;
  customerId?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  zipCode?: string | null;
  agreeToTerms: boolean;
  marketingOptIn: boolean;
  signupSource: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: string;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Insert a new registration record into logic_details_db. */
export function insertRegistration(
  input: Omit<RegistrationDetails, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'emailVerifiedAt' | 'lastLoginAt'> & {
    id?: string;
    status?: string;
  },
): RegistrationDetails {
  const db = getLogicDetailsDb();
  const id = input.id ?? 'reg_' + crypto.randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'ACTIVE';

  db.prepare(`
    INSERT INTO RegistrationDetails (
      id, userId, fullName, email, passwordHash, phone, company, jobTitle,
      role, customerId, country, city, address, zipCode,
      agreeToTerms, marketingOptIn, signupSource, ipAddress, userAgent,
      status, createdAt, updatedAt
    ) VALUES (
      @id, @userId, @fullName, @email, @passwordHash, @phone, @company, @jobTitle,
      @role, @customerId, @country, @city, @address, @zipCode,
      @agreeToTerms, @marketingOptIn, @signupSource, @ipAddress, @userAgent,
      @status, @createdAt, @updatedAt
    )
  `).run({
    id,
    userId: input.userId,
    fullName: input.fullName,
    email: input.email,
    passwordHash: input.passwordHash,
    phone: input.phone ?? null,
    company: input.company ?? null,
    jobTitle: input.jobTitle ?? null,
    role: input.role,
    customerId: input.customerId ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    zipCode: input.zipCode ?? null,
    agreeToTerms: input.agreeToTerms ? 1 : 0,
    marketingOptIn: input.marketingOptIn ? 1 : 0,
    signupSource: input.signupSource,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    status,
    createdAt: now,
    updatedAt: now,
  });

  return getRegistrationById(id)!;
}

/** Find a registration by email (case-insensitive). */
export function findRegistrationByEmail(email: string): RegistrationDetails | null {
  const db = getLogicDetailsDb();
  const row = db
    .prepare('SELECT * FROM RegistrationDetails WHERE lower(email) = lower(?) LIMIT 1')
    .get(email.trim().toLowerCase()) as any;
  return row ? normalizeRegistration(row) : null;
}

/** Find a registration by id. */
export function getRegistrationById(id: string): RegistrationDetails | null {
  const db = getLogicDetailsDb();
  const row = db
    .prepare('SELECT * FROM RegistrationDetails WHERE id = ? LIMIT 1')
    .get(id) as any;
  return row ? normalizeRegistration(row) : null;
}

/** Update the lastLoginAt timestamp on a registration. */
export function touchLastLogin(email: string): void {
  const db = getLogicDetailsDb();
  db.prepare(
    `UPDATE RegistrationDetails SET lastLoginAt = ?, updatedAt = ? WHERE lower(email) = lower(?)`,
  ).run(new Date().toISOString(), new Date().toISOString(), email.trim().toLowerCase());
}

/** List active registrations (most recent first). */
export function listActiveRegistrations(limit = 100): RegistrationDetails[] {
  const db = getLogicDetailsDb();
  const rows = db
    .prepare('SELECT * FROM RegistrationDetails WHERE status = ? ORDER BY createdAt DESC LIMIT ?')
    .all('ACTIVE', limit) as any[];
  return rows.map(normalizeRegistration);
}

function normalizeRegistration(row: any): RegistrationDetails {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    passwordHash: row.passwordHash,
    phone: row.phone,
    company: row.company,
    jobTitle: row.jobTitle,
    role: row.role,
    customerId: row.customerId,
    country: row.country,
    city: row.city,
    address: row.address,
    zipCode: row.zipCode,
    agreeToTerms: !!row.agreeToTerms,
    marketingOptIn: !!row.marketingOptIn,
    signupSource: row.signupSource,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
