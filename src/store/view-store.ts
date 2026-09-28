// src/store/view-store.ts — Client-side navigation for the single-page app.
// The whole DealFlow360 UI lives on `/`. The sidebar updates `activeView`
// and optional context (e.g. the open quote id).

import { create } from 'zustand';

export type DealView =
  | 'dashboard'
  | 'quotes'
  | 'quote-detail'
  | 'approvals'
  | 'fulfillment'
  | 'billing'
  | 'customers'
  | 'products'
  | 'settings'
  | 'audit'
  | 'portal'
  | 'negotiations'
  | 'registrations'
  | 'register-data';

export interface ViewState {
  view: DealView;
  /** Optional context payload — e.g. selected quote id, customer id, tab. */
  context: Record<string, string | number | undefined>;
  setView: (view: DealView, context?: Record<string, string | number | undefined>) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'dashboard',
  context: {},
  setView: (view, context = {}) => set({ view, context }),
}));
