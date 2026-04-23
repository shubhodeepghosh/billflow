import { create } from "zustand";
import type { AuthUser } from "@/types";
import { getToken } from "@/services/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: AuthUser | null, token: string | null) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isHydrated: false,
  setAuth: (user, token) => set({ user, token }),
  hydrate: () => set({ token: getToken(), isHydrated: true }),
}));
