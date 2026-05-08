import { api, hasConfiguredApiBackend, isApiUnavailableError } from "./api";
import type { Expense, PaginatedResponse } from "@/types";
import { localExpenses, type ExpenseQuery } from "./localDb";

export const expenseService = {
  getAll: async (params: ExpenseQuery = {}): Promise<PaginatedResponse<Expense>> => {
    if (!hasConfiguredApiBackend) return localExpenses.getAll(params);
    try {
      const { data } = await api.get<PaginatedResponse<Expense>>("/expenses", { params });
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localExpenses.getAll(params);
    }
  },
  getById: async (id: string): Promise<Expense> => {
    if (!hasConfiguredApiBackend) return localExpenses.getById(id);
    try {
      const { data } = await api.get<Expense>(`/expenses/${id}`);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localExpenses.getById(id);
    }
  },
  create: async (payload: Partial<Expense>): Promise<Expense> => {
    if (!hasConfiguredApiBackend) return localExpenses.create(payload);
    try {
      const { data } = await api.post<Expense>("/expenses", payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localExpenses.create(payload);
    }
  },
  update: async (id: string, payload: Partial<Expense>): Promise<Expense> => {
    if (!hasConfiguredApiBackend) return localExpenses.update(id, payload);
    try {
      const { data } = await api.put<Expense>(`/expenses/${id}`, payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localExpenses.update(id, payload);
    }
  },
  delete: async (id: string): Promise<void> => {
    if (!hasConfiguredApiBackend) {
      localExpenses.delete(id);
      return;
    }
    try {
      await api.delete(`/expenses/${id}`);
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      localExpenses.delete(id);
    }
  },
};
