import { api, setToken, clearToken, isApiUnavailableError } from "./api";
import type { AuthResponse, AuthUser } from "@/types";
import { localAuth } from "./localDb";

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const { data } = await api.post<AuthResponse>("/auth/login", { email, password });
      setToken(data.token);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      const data = localAuth.login(email, password);
      setToken(data.token);
      return data;
    }
  },
  register: async (name: string, email: string, password: string): Promise<AuthResponse> => {
    try {
      const { data } = await api.post<AuthResponse>("/auth/register", { name, email, password });
      setToken(data.token);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      const data = localAuth.register(name, email, password);
      setToken(data.token);
      return data;
    }
  },
  me: async (): Promise<AuthUser> => {
    try {
      const { data } = await api.get<AuthUser>("/auth/me");
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localAuth.me();
    }
  },
  logout: () => {
    api.post("/auth/logout").catch(() => void 0);
    localAuth.logout();
    clearToken();
  },
};
