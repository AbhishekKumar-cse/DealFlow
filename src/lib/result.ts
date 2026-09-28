// src/lib/result.ts — Lightweight Result type for predictable error handling.
// Domain engines return Result<T> instead of throwing for expected business
// errors; unexpected programmer errors still throw.

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } =>
  r.ok === true;

export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } =>
  r.ok === false;

export const mapResult = <T, E, U>(
  r: Result<T, E>,
  fn: (v: T) => U,
): Result<U, E> => (r.ok ? ok(fn(r.value)) : r);

export const unwrapResult = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
