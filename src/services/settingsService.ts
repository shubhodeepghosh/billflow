import { api, isApiUnavailableError } from "./api";
import type { AppSettings } from "@/types";
import { localSettings } from "./localDb";

export const settingsService = {
  get: async (): Promise<AppSettings> => {
    try {
      const { data } = await api.get<AppSettings>("/settings");
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localSettings.get();
    }
  },
  update: async (payload: Partial<AppSettings>): Promise<AppSettings> => {
    try {
      const { data } = await api.put<AppSettings>("/settings", payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localSettings.update(payload);
    }
  },
};
