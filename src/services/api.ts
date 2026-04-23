import axios, { AxiosError, AxiosInstance } from "axios";
import { getStoredLanguage } from "@/lib/i18n";

const TOKEN_KEY = "billflow_token";

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
};

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const hasConfiguredApiBackend = Boolean(
  import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL !== "/api",
);

export const api: AxiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["X-BillFlow-Language"] = getStoredLanguage();
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiError {
  message: string;
  status?: number;
}

export const toApiError = (err: unknown): ApiError => {
  if (axios.isAxiosError(err)) {
    return {
      message: (err.response?.data as { message?: string } | undefined)?.message ?? err.message,
      status: err.response?.status,
    };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: "Unknown error" };
};

export const isApiUnavailableError = (err: unknown): boolean => {
  if (!axios.isAxiosError(err)) return false;
  return !err.response || err.response.status === 404 || err.response.status === 405;
};
