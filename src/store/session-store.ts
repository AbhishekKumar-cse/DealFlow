// src/store/session-store.ts — Client-side session mirror.
// The session is authoritative on the server (NextAuth). This store mirrors
// the public session payload so the UI can switch roles/views without a
// round-trip on every render.

import { create } from 'zustand';

export type Role = 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE_OPERATIONS' | 'CUSTOMER' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** For CUSTOMER role only — the organization (customer) id. */
  customerId?: string;
}

interface SessionState {
  user: SessionUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  setUser: (user: SessionUser | null) => void;
  setStatus: (status: SessionState['status']) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  signOut: () => set({ user: null, status: 'unauthenticated' }),
}));

/** Convenience selector hook. */
export const useCurrentUser = () => useSessionStore((s) => s.user);
