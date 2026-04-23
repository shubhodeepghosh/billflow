import { api, isApiUnavailableError } from "./api";
import type { Product, PaginatedResponse } from "@/types";
import { localProducts, type ProductQuery } from "./localDb";

export const productService = {
  getAll: async (params: ProductQuery = {}): Promise<PaginatedResponse<Product>> => {
    try {
      const { data } = await api.get<PaginatedResponse<Product>>("/products", { params });
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localProducts.getAll(params);
    }
  },
  getById: async (id: string): Promise<Product> => {
    try {
      const { data } = await api.get<Product>(`/products/${id}`);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localProducts.getById(id);
    }
  },
  create: async (payload: Partial<Product>): Promise<Product> => {
    try {
      const { data } = await api.post<Product>("/products", payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localProducts.create(payload);
    }
  },
  update: async (id: string, payload: Partial<Product>): Promise<Product> => {
    try {
      const { data } = await api.put<Product>(`/products/${id}`, payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localProducts.update(id, payload);
    }
  },
  delete: async (id: string): Promise<void> => {
    try {
      await api.delete(`/products/${id}`);
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      localProducts.delete(id);
    }
  },
};
