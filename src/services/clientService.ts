import { api, isApiUnavailableError } from "./api";
import type { Client, PaginatedResponse } from "@/types";
import { localClients, type ClientQuery } from "./localDb";

export const clientService = {
  getAll: async (params: ClientQuery = {}): Promise<PaginatedResponse<Client>> => {
    try {
      const { data } = await api.get<PaginatedResponse<Client>>("/clients", { params });
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localClients.getAll(params);
    }
  },
  getById: async (id: string): Promise<Client> => {
    try {
      const { data } = await api.get<Client>(`/clients/${id}`);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localClients.getById(id);
    }
  },
  create: async (payload: Partial<Client>): Promise<Client> => {
    try {
      const { data } = await api.post<Client>("/clients", payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localClients.create(payload);
    }
  },
  update: async (id: string, payload: Partial<Client>): Promise<Client> => {
    try {
      const { data } = await api.put<Client>(`/clients/${id}`, payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localClients.update(id, payload);
    }
  },
  delete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/clients/${id}`);
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      localClients.delete(id);
    }
  },
};
