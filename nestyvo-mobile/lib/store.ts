import { create } from 'zustand';

export type UserRole = 'administrator' | 'scheduling_agent' | 'provider' | 'practice_manager';

interface AuthState {
  token: string | null;
  role: UserRole | null;
  userId: string | null;
  name: string | null;
  practiceId: string | null;
  setAuth: (token: string, role: UserRole, userId: string, name: string, practiceId?: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  userId: null,
  name: null,
  practiceId: null,
  setAuth: (token, role, userId, name, practiceId) =>
    set({ token, role, userId, name, practiceId: practiceId ?? null }),
  clearAuth: () => set({ token: null, role: null, userId: null, name: null, practiceId: null }),
}));
