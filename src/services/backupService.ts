import { api, isApiUnavailableError } from "./api";
import { localStorageHelpers } from "./localDb";
import type { AppSettings, Client, Expense, Invoice, Product } from "@/types";

export interface WorkspaceBackup {
  version: 1;
  exportedAt: string;
  users: Array<{ id: string; name: string; email: string; password: string; avatar?: string }>;
  settings: AppSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  expenses: Expense[];
}

export const backupService = {
  export: async (): Promise<WorkspaceBackup> => {
    try {
      const { data } = await api.get<WorkspaceBackup>("/backup");
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localStorageHelpers.exportAppData() as WorkspaceBackup;
    }
  },
  restore: async (snapshot: WorkspaceBackup): Promise<WorkspaceBackup> => {
    try {
      const { data } = await api.post<WorkspaceBackup>("/backup/restore", snapshot);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localStorageHelpers.importAppData(snapshot as never) as WorkspaceBackup;
    }
  },
};
