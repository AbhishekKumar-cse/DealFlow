// src/app/api/temp/route.ts — Read from the temp SQLite database.
//
// Demonstrates accessing the separate temp database (db/temp.db) via
// Node's built-in node:sqlite. Server-side only.

import { NextResponse } from 'next/server';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { requireRole } from '@/lib/auth';
import { withErrorHandler } from '@/lib/api-error';

export const GET = withErrorHandler(async () => {
  await requireRole('SALES_REP', 'SALES_MANAGER', 'FINANCE_OPERATIONS', 'ADMIN');

  const dbPath = resolve(process.cwd(), 'db/temp.db');
  const db = new DatabaseSync(dbPath);

  try {
    const customers = db
      .prepare('SELECT * FROM TempCustomer ORDER BY createdAt DESC LIMIT 50')
      .all();
    const products = db
      .prepare('SELECT * FROM TempProduct ORDER BY createdAt DESC LIMIT 50')
      .all();
    const quotes = db
      .prepare(`
        SELECT q.*, c.name AS customerName
        FROM TempQuote q
        JOIN TempCustomer c ON c.id = q.customerId
        ORDER BY q.createdAt DESC LIMIT 50
      `)
      .all();
    const logs = db
      .prepare('SELECT * FROM TempLog ORDER BY createdAt DESC LIMIT 50')
      .all();
    const cache = db
      .prepare('SELECT * FROM TempCache ORDER BY createdAt DESC LIMIT 50')
      .all();

    // Count active (non-expired) records
    const now = new Date().toISOString();
    const stats = {
      customers: (db.prepare('SELECT COUNT(*) AS c FROM TempCustomer WHERE expiresAt > ?').get(now) as { c: number }).c,
      products: (db.prepare('SELECT COUNT(*) AS c FROM TempProduct WHERE expiresAt > ?').get(now) as { c: number }).c,
      quotes: (db.prepare('SELECT COUNT(*) AS c FROM TempQuote WHERE expiresAt > ?').get(now) as { c: number }).c,
      logs: (db.prepare('SELECT COUNT(*) AS c FROM TempLog WHERE expiresAt > ?').get(now) as { c: number }).c,
      cache: (db.prepare('SELECT COUNT(*) AS c FROM TempCache WHERE expiresAt > ?').get(now) as { c: number }).c,
    };

    return NextResponse.json({
      database: 'temp.db',
      stats,
      customers,
      products,
      quotes,
      logs,
      cache,
    });
  } finally {
    db.close();
  }
});
