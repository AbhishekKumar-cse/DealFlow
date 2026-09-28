// src/services/auth/password.ts — scrypt-based password hashing.
// Uses Node's built-in crypto.scrypt (no native bcrypt dependency required).

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith('scrypt$')) return false;
  const [, salt, hashHex] = stored.split('$');
  if (!salt || !hashHex) return false;
  const computed = scryptSync(plain, salt, KEY_LEN);
  const storedBytes = Buffer.from(hashHex, 'hex');
  if (computed.length !== storedBytes.length) return false;
  return timingSafeEqual(computed, storedBytes);
}
