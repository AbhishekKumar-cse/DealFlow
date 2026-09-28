// src/lib/pagination.ts — Shared pagination helper for list endpoints.

import { Prisma } from '@prisma/client';
import type { Pagination } from '@/lib/schemas/master-data';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, p: Pagination): PaginatedResult<T> {
  return {
    data: items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export function pageBounds(p: Pagination): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

/** Build a Prisma `where` clause with case-insensitive name search (SQLite uses `mode: 'insensitive'` only on Postgres; we use `contains` with `contains` for SQLite). */
export function nameSearch(search?: string): Prisma.StringFilter | undefined {
  if (!search) return undefined;
  return { contains: search };
}
