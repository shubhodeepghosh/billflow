import { api, hasConfiguredApiBackend, isApiUnavailableError } from "./api";
import type { AnalyticsOverview, InvoiceStatusDistribution, RevenuePoint } from "@/types";
import { localAnalytics } from "./localDb";

export const analyticsService = {
  overview: async (): Promise<AnalyticsOverview> => {
    if (!hasConfiguredApiBackend) return localAnalytics.overview();
    try {
      const { data } = await api.get<AnalyticsOverview>("/analytics/overview");
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localAnalytics.overview();
    }
  },
  revenue: async (range: string = "30d"): Promise<RevenuePoint[]> => {
    if (!hasConfiguredApiBackend) return localAnalytics.revenue(range);
    try {
      const { data } = await api.get<RevenuePoint[]>("/analytics/revenue", {
        params: { range },
      });
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localAnalytics.revenue(range);
    }
  },
  invoiceStatus: async (): Promise<InvoiceStatusDistribution[]> => {
    if (!hasConfiguredApiBackend) return localAnalytics.invoiceStatus();
    try {
      const { data } = await api.get<InvoiceStatusDistribution[]>("/analytics/invoice-status");
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localAnalytics.invoiceStatus();
    }
  },
};
