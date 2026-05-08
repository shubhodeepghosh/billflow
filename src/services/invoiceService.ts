import { api, hasConfiguredApiBackend, isApiUnavailableError } from "./api";
import type { Invoice, PaginatedResponse } from "@/types";
import { localInvoices, localSettings, type InvoiceQuery } from "./localDb";
import { getStoredLanguage } from "@/lib/i18n";

export interface SendInvoiceResult {
  invoice: Invoice;
  email: {
    to: string;
    subject: string;
    body: string;
    mailtoUrl: string;
    delivered?: boolean;
    transport?: "smtp" | "mailto" | "preview";
    providerMessage?: string;
  };
}

export const invoiceService = {
  getAll: async (params: InvoiceQuery = {}): Promise<PaginatedResponse<Invoice>> => {
    if (!hasConfiguredApiBackend) return localInvoices.getAll(params);
    try {
      const { data } = await api.get<PaginatedResponse<Invoice>>("/invoices", { params });
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localInvoices.getAll(params);
    }
  },
  getById: async (id: string): Promise<Invoice> => {
    if (!hasConfiguredApiBackend) return localInvoices.getById(id);
    try {
      const { data } = await api.get<Invoice>(`/invoices/${id}`);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localInvoices.getById(id);
    }
  },
  create: async (payload: Partial<Invoice>): Promise<Invoice> => {
    if (!hasConfiguredApiBackend) return localInvoices.create(payload);
    try {
      const { data } = await api.post<Invoice>("/invoices", payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localInvoices.create(payload);
    }
  },
  update: async (id: string, payload: Partial<Invoice>): Promise<Invoice> => {
    if (!hasConfiguredApiBackend) return localInvoices.update(id, payload);
    try {
      const { data } = await api.put<Invoice>(`/invoices/${id}`, payload);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      return localInvoices.update(id, payload);
    }
  },
  delete: async (id: string): Promise<void> => {
    if (!hasConfiguredApiBackend) {
      localInvoices.delete(id);
      return;
    }
    try {
      await api.delete(`/invoices/${id}`);
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      localInvoices.delete(id);
    }
  },
  send: async (id: string): Promise<SendInvoiceResult> => {
    if (!hasConfiguredApiBackend) {
      const invoice = localInvoices.update(id, {
        status: "sent",
        sentAt: new Date().toISOString(),
      });
      const settings = localSettings.get();
      const language = getStoredLanguage();
      const to = invoice.client?.email ?? "";
      const subject = `${settings.companyName} invoice ${invoice.number}`;
      const body = [
        `Hi ${invoice.client?.name ?? "there"},`,
        "",
        `Please find your invoice ${invoice.number} attached/ready for payment.`,
        `Amount due: ${settings.currency} ${invoice.total.toFixed(2)}`,
        `Due date: ${invoice.dueDate}`,
        "",
        settings.paymentTerms,
        "",
        settings.footerMessage,
        "",
        `Invoice link: /invoices/${invoice.id}`,
      ].join("\n");
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return {
        invoice,
        email: { to, subject, body, mailtoUrl, delivered: false, transport: "mailto" },
      };
    }
    try {
      const { data } = await api.post<SendInvoiceResult>(`/invoices/${id}/send`);
      return data;
    } catch (error) {
      if (!isApiUnavailableError(error)) throw error;
      const invoice = localInvoices.update(id, {
        status: "sent",
        sentAt: new Date().toISOString(),
      });
      const settings = localSettings.get();
      const language = getStoredLanguage();
      const to = invoice.client?.email ?? "";
      const subject =
        language === "bn"
          ? `${settings.companyName} ইনভয়েস ${invoice.number}`
          : `${settings.companyName} invoice ${invoice.number}`;
      const body = [
        language === "bn"
          ? `প্রিয় ${invoice.client?.name ?? "গ্রাহক"},`
          : `Hi ${invoice.client?.name ?? "there"},`,
        "",
        language === "bn"
          ? `আপনার ইনভয়েস ${invoice.number} সংযুক্ত/পেমেন্টের জন্য প্রস্তুত।`
          : `Please find your invoice ${invoice.number} attached/ready for payment.`,
        language === "bn"
          ? `দেয় পরিমাণ: ${settings.currency} ${invoice.total.toFixed(2)}`
          : `Amount due: ${settings.currency} ${invoice.total.toFixed(2)}`,
        language === "bn" ? `ডিউ তারিখ: ${invoice.dueDate}` : `Due date: ${invoice.dueDate}`,
        "",
        settings.paymentTerms,
        "",
        settings.footerMessage,
        "",
        `${language === "bn" ? "ইনভয়েস লিংক" : "Invoice link"}: /invoices/${invoice.id}`,
      ].join("\n");
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return {
        invoice,
        email: { to, subject, body, mailtoUrl, delivered: false, transport: "mailto" },
      };
    }
  },
};
