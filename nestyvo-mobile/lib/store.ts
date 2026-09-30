import { create } from 'zustand';

export type UserRole = 'administrator' | 'scheduling_agent' | 'provider' | 'practice_manager';

interface AuthState {
  token: string | null;
  role: UserRole | null;
  userId: string | null;
  name: string | null;
  practiceId: string | null;
  // False until the root layout has finished trying to restore a persisted
  // session (see lib/auth.ts persistSession/loadPersistedSession) — routes
  // that gate on `token` should wait for this before deciding "logged out"
  // vs. "still checking," or a page refresh reads as a real logout for the
  // instant before hydration completes.
  hydrated: boolean;
  setAuth: (token: string, role: UserRole, userId: string, name: string, practiceId?: string) => void;
  clearAuth: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  userId: null,
  name: null,
  practiceId: null,
  hydrated: false,
  setAuth: (token, role, userId, name, practiceId) =>
    set({ token, role, userId, name, practiceId: practiceId ?? null }),
  clearAuth: () => set({ token: null, role: null, userId: null, name: null, practiceId: null }),
  setHydrated: () => set({ hydrated: true }),
}));
