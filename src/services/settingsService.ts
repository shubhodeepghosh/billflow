import { api, hasConfiguredApiBackend, isApiUnavailableError } from "./api";
import type { AppSettings } from "@/types";
import { localSettings } from "./localDb";

export const hasMeaningfulSettings = (settings: AppSettings) =>
  Boolean(
    [
      settings.companyName,
      settings.legalName,
      settings.email,
      settings.phone,
      settings.address,
      settings.website,
      settings.logoUrl,
      settings.footerMessage,
      settings.invoicePrefix,
      settings.paymentTerms,
      settings.smtpHost,
      settings.smtpUser,
      settings.smtpFromEmail,
    ].some((value) => String(value ?? "").trim().length > 0),
  );

export const settingsService = {
  get: async (): Promise<AppSettings> => {
    if (!hasConfiguredApiBackend) {
      return localSettings.get();
    }
    const local = localSettings.get();
    if (hasMeaningfulSettings(local)) {
      return local;
    }
    try {
      const { data } = await api.get<AppSettings>("/settings");
      localSettings.update(data);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return local;
    }
  },
  update: async (payload: Partial<AppSettings>): Promise<AppSettings> => {
    if (!hasConfiguredApiBackend) {
      return localSettings.update(payload);
    }
    const optimistic = localSettings.update(payload);
    try {
      const { data } = await api.put<AppSettings>("/settings", payload);
      localSettings.update(data);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return optimistic;
    }
  },
};
