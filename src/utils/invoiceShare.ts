import type { AppSettings, Invoice } from "@/types";
import type { Language } from "@/lib/i18n";

const moneyLine = (currency: string, value: number) => `${currency} ${value.toFixed(2)}`;

const clientName = (invoice: Invoice, language: Language) =>
  invoice.client?.name ?? (language === "bn" ? "গ্রাহক" : "there");

export const buildInvoiceShareText = (
  invoice: Invoice,
  settings: AppSettings,
  language: Language,
  baseUrl: string,
  contact?: { email?: string; phone?: string },
) => {
  const currency = settings.currency || "INR";
  const email = contact?.email ?? invoice.client?.email ?? "";
  const phone = (contact?.phone ?? invoice.client?.phone ?? "").replace(/\D/g, "");
  const subject =
    language === "bn"
      ? `${settings.companyName} ইনভয়েস ${invoice.number}`
      : `${settings.companyName} invoice ${invoice.number}`;

  const bodyLines = [
    language === "bn"
      ? `প্রিয় ${clientName(invoice, language)},`
      : `Hi ${clientName(invoice, language)},`,
    "",
    language === "bn"
      ? `আপনার ইনভয়েস ${invoice.number} প্রস্তুত করা হয়েছে।`
      : `Your invoice ${invoice.number} is ready.`,
    "",
    language === "bn"
      ? `বকেয়া: ${moneyLine(currency, invoice.total)}`
      : `Amount due: ${moneyLine(currency, invoice.total)}`,
    language === "bn" ? `দেয় তারিখ: ${invoice.dueDate}` : `Due date: ${invoice.dueDate}`,
    "",
    settings.paymentTerms,
    settings.footerMessage ? "" : null,
    settings.footerMessage || null,
    "",
    `${language === "bn" ? "ইনভয়েস লিংক" : "Invoice link"}: ${baseUrl}/invoices/${invoice.id}`,
  ].filter(Boolean) as string[];

  const body = bodyLines.join("\n");
  const whatsappText = [
    language === "bn"
      ? `প্রিয় ${clientName(invoice, language)},`
      : `Hi ${clientName(invoice, language)},`,
    "",
    language === "bn"
      ? `আপনার ইনভয়েস ${invoice.number} প্রস্তুত।`
      : `Your invoice ${invoice.number} is ready.`,
    "",
    language === "bn"
      ? `বকেয়া: ${moneyLine(currency, invoice.total)}`
      : `Amount due: ${moneyLine(currency, invoice.total)}`,
    "",
    `${language === "bn" ? "ইনভয়েস লিংক" : "Invoice link"}: ${baseUrl}/invoices/${invoice.id}`,
  ].join("\n");

  return {
    subject,
    body,
    whatsappText,
    mailtoUrl: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    whatsappUrl: phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`,
  };
};
