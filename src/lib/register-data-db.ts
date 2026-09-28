// src/lib/register-data-db.ts — Singleton accessor for register_data_db.
//
// A brand-new SQLite database (db/register_data.db) with 3 tables:
//   - RegisterData (primary registration records)
//   - RegisterActivity (login/update tracking)
//   - RegisterAuditLog (change audit trail)
// Plus 3 views: v_ActiveRegistrations, v_RegistrationsByRole, v_RecentActivity
//
// Server-side only. Never import this from a client component.

import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'db/register_data.db');

let _db: DatabaseSync | null = null;

/** Get a singleton connection to register_data.db. */
export function getRegisterDataDb(): DatabaseSync {
  if (_db) return _db;
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  _db = db;
  return db;
}

export interface RegisterDataRow {
  id: number;
  userId: string | null;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  altPhone: string | null;
  company: string | null;
  companySize: string | null;
  jobTitle: string | null;
  department: string | null;
  role: string;
  customerId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  website: string | null;
  linkedin: string | null;
  twitter: string | null;
  bio: string | null;
  avatarUrl: string | null;
  agreeToTerms: boolean;
  marketingOptIn: boolean;
  productUpdates: boolean;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerified: boolean;
  signupSource: string;
  referralCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterActivityRow {
  id: number;
  registerId: number;
  activityType: string;
  description: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface RegisterAuditLogRow {
  id: number;
  registerId: number;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
}

/** Insert a new registration. */
export function insertRegistration(input: {
  userId?: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  role: string;
  customerId?: string;
  city?: string;
  country?: string;
  addressLine1?: string;
  zipCode?: string;
  agreeToTerms: boolean;
  marketingOptIn?: boolean;
  signupSource?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
}): number {
  const db = getRegisterDataDb();
  const now = new Date().toISOString();
  const status = input.status ?? 'ACTIVE';
  const signupSource = input.signupSource ?? 'web';

  const result = db.prepare(`
    INSERT INTO RegisterData (
      userId, firstName, lastName, fullName, email, passwordHash,
      phone, company, jobTitle, role, customerId,
      city, country, addressLine1, zipCode,
      agreeToTerms, marketingOptIn, productUpdates,
      status, emailVerified, phoneVerified,
      signupSource, referralCode, ipAddress, userAgent,
      lastLoginAt, loginCount, createdAt, updatedAt
    ) VALUES (
      @userId, @firstName, @lastName, @fullName, @email, @passwordHash,
      @phone, @company, @jobTitle, @role, @customerId,
      @city, @country, @addressLine1, @zipCode,
      @agreeToTerms, @marketingOptIn, 0,
      @status, 0, 0,
      @signupSource, NULL, @ipAddress, @userAgent,
      NULL, 0, @now, @now
    )
  `).run({
    userId: input.userId ?? null,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    fullName: input.fullName,
    email: input.email.toLowerCase(),
    passwordHash: input.passwordHash,
    phone: input.phone ?? null,
    company: input.company ?? null,
    jobTitle: input.jobTitle ?? null,
    role: input.role,
    customerId: input.customerId ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    addressLine1: input.addressLine1 ?? null,
    zipCode: input.zipCode ?? null,
    agreeToTerms: input.agreeToTerms ? 1 : 0,
    marketingOptIn: input.marketingOptIn ? 1 : 0,
    status,
    signupSource,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    now,
  });

  const newId = Number(result.lastInsertRowid);

  // Audit log entry.
  db.prepare(`
    INSERT INTO RegisterAuditLog (registerId, action, fieldName, oldValue, newValue, changedBy, reason, createdAt)
    VALUES (?, 'CREATE', NULL, NULL, ?, 'system', 'User registration', ?)
  `).run(newId, input.fullName, now);

  return newId;
}

/** Find by email (case-insensitive). */
export function findRegisterByEmail(email: string): RegisterDataRow | null {
  const db = getRegisterDataDb();
  const row = db
    .prepare('SELECT * FROM RegisterData WHERE lower(email) = lower(?) LIMIT 1')
    .get(email.trim().toLowerCase()) as any;
  return row ? normalizeRegister(row) : null;
}

/** Get by id. */
export function getRegisterById(id: number): RegisterDataRow | null {
  const db = getRegisterDataDb();
  const row = db
    .prepare('SELECT * FROM RegisterData WHERE id = ? LIMIT 1')
    .get(id) as any;
  return row ? normalizeRegister(row) : null;
}

/** List with filters. */
export function listRegisters(opts: {
  search?: string;
  role?: string;
  status?: string;
  limit?: number;
} = {}): RegisterDataRow[] {
  const db = getRegisterDataDb();
  let sql = 'SELECT * FROM RegisterData WHERE 1=1';
  const params: any[] = [];
  if (opts.search) {
    sql += ' AND (lower(fullName) LIKE ? OR lower(email) LIKE ? OR lower(company) LIKE ?)';
    const q = '%' + opts.search.toLowerCase() + '%';
    params.push(q, q, q);
  }
  if (opts.role) {
    sql += ' AND role = ?';
    params.push(opts.role);
  }
  if (opts.status) {
    sql += ' AND status = ?';
    params.push(opts.status);
  }
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(opts.limit ?? 500);
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(normalizeRegister);
}

/** Get activity log for a registration. */
export function getActivityLog(registerId: number, limit = 50): RegisterActivityRow[] {
  const db = getRegisterDataDb();
  return db
    .prepare('SELECT * FROM RegisterActivity WHERE registerId = ? ORDER BY createdAt DESC LIMIT ?')
    .all(registerId, limit) as any[];
}

/** Get audit log for a registration. */
export function getAuditLog(registerId: number, limit = 50): RegisterAuditLogRow[] {
  const db = getRegisterDataDb();
  return db
    .prepare('SELECT * FROM RegisterAuditLog WHERE registerId = ? ORDER BY createdAt DESC LIMIT ?')
    .all(registerId, limit) as any[];
}

/** Update lastLoginAt + increment loginCount. Also log an activity entry. */
export function touchLogin(email: string, ip?: string | null): void {
  const db = getRegisterDataDb();
  const now = new Date().toISOString();
  const row = db
    .prepare('SELECT id, fullName FROM RegisterData WHERE lower(email) = lower(?) LIMIT 1')
    .get(email.trim().toLowerCase()) as { id: number; fullName: string } | undefined;
  if (!row) return;
  db.prepare(
    'UPDATE RegisterData SET lastLoginAt = ?, loginCount = loginCount + 1, updatedAt = ? WHERE id = ?',
  ).run(now, now, row.id);
  db.prepare(`
    INSERT INTO RegisterActivity (registerId, activityType, description, ipAddress, metadata, createdAt)
    VALUES (?, 'LOGIN', ?, ?, NULL, ?)
  `).run(row.id, `User signed in: ${row.fullName}`, ip ?? null, now);
}

/** Stats summary. */
export function getRegisterStats() {
  const db = getRegisterDataDb();
  return {
    total: (db.prepare('SELECT COUNT(*) AS c FROM RegisterData').get() as { c: number }).c,
    active: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE status = 'ACTIVE'").get() as { c: number }).c,
    suspended: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE status = 'SUSPENDED'").get() as { c: number }).c,
    pending: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE status = 'PENDING'").get() as { c: number }).c,
    emailVerified: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE emailVerified = 1").get() as { c: number }).c,
    last7Days: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE createdAt >= datetime('now', '-7 days')").get() as { c: number }).c,
    last30Days: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE createdAt >= datetime('now', '-30 days')").get() as { c: number }).c,
    neverLoggedIn: (db.prepare("SELECT COUNT(*) AS c FROM RegisterData WHERE lastLoginAt IS NULL").get() as { c: number }).c,
    byRole: db
      .prepare('SELECT role, COUNT(*) AS count FROM RegisterData GROUP BY role ORDER BY count DESC')
      .all() as { role: string; count: number }[],
    byCountry: db
      .prepare("SELECT country, COUNT(*) AS count FROM RegisterData WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 10")
      .all() as { country: string; count: number }[],
  };
}

function normalizeRegister(r: any): RegisterDataRow {
  return {
    id: r.id,
    userId: r.userId,
    firstName: r.firstName,
    lastName: r.lastName,
    fullName: r.fullName,
    email: r.email,
    passwordHash: r.passwordHash,
    phone: r.phone,
    altPhone: r.altPhone,
    company: r.company,
    companySize: r.companySize,
    jobTitle: r.jobTitle,
    department: r.department,
    role: r.role,
    customerId: r.customerId,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    country: r.country,
    zipCode: r.zipCode,
    website: r.website,
    linkedin: r.linkedin,
    twitter: r.twitter,
    bio: r.bio,
    avatarUrl: r.avatarUrl,
    agreeToTerms: !!r.agreeToTerms,
    marketingOptIn: !!r.marketingOptIn,
    productUpdates: !!r.productUpdates,
    status: r.status,
    emailVerified: !!r.emailVerified,
    emailVerifiedAt: r.emailVerifiedAt,
    phoneVerified: !!r.phoneVerified,
    signupSource: r.signupSource,
    referralCode: r.referralCode,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    lastLoginAt: r.lastLoginAt,
    loginCount: r.loginCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
