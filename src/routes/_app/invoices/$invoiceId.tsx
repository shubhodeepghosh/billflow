import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Copy, Download, Mail, MessageCircleMore, Printer, Trash2 } from "lucide-react";
import { invoiceService } from "@/services/invoiceService";
import { Skeleton, SkeletonText } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/utils/format";
import { toast } from "sonner";
import { toApiError } from "@/services/api";
import type { InvoiceStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { settingsService } from "@/services/settingsService";
import { useI18n } from "@/lib/i18n";
import { buildInvoiceShareText } from "@/utils/invoiceShare";

export const Route = createFileRoute("/_app/invoices/$invoiceId")({
  component: InvoiceDetailPage,
});

type FollowUpAction = "print" | "email" | "whatsapp";
const FOLLOW_UP_KEY = "billflow_invoice_followup";

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t, language } = useI18n();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoices", invoiceId],
    queryFn: () => invoiceService.getById(invoiceId),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsService.get,
  });
  const currency = settings.data?.currency ?? "INR";
  const shareContext =
    data && settings.data && typeof window !== "undefined"
      ? buildInvoiceShareText(data, settings.data, language, window.location.origin)
      : null;

  const updateStatus = useMutation({
    mutationFn: async (status: InvoiceStatus) => invoiceService.update(invoiceId, { status }),
    onSuccess: () => {
      toast.success("Invoice status updated");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices", invoiceId] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("Invoice not loaded");
      const duplicatedItems = data.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        productId: item.productId,
      }));
      return invoiceService.create({
        clientId: data.clientId,
        status: "draft",
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        items: duplicatedItems,
        taxRate: data.taxRate,
        notes: data.notes,
      });
    },
    onSuccess: (copy) => {
      toast.success(`Duplicated as ${copy.number}`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: copy.id } });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const send = useMutation({
    mutationFn: async () => invoiceService.send(invoiceId),
    onSuccess: (result) => {
      toast.success(
        result.email.delivered
          ? "Invoice emailed successfully"
          : `Invoice prepared for ${result.email.to || "client email"}`,
      );
      if (result.email.mailtoUrl) {
        window.open(result.email.mailtoUrl, "_blank", "noopener,noreferrer");
      }
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices", invoiceId] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    const raw = window.sessionStorage.getItem(FOLLOW_UP_KEY);
    if (!raw) return;
    try {
      const next = JSON.parse(raw) as { invoiceId?: string; action?: FollowUpAction };
      if (next.invoiceId !== invoiceId || !next.action) return;
      window.sessionStorage.removeItem(FOLLOW_UP_KEY);
      if (next.action === "print") {
        window.setTimeout(() => window.print(), 200);
        return;
      }
      if (next.action === "email") {
        send.mutate();
        return;
      }
      if (next.action === "whatsapp" && shareContext) {
        window.location.href = shareContext.whatsappUrl;
      }
    } catch {
      window.sessionStorage.removeItem(FOLLOW_UP_KEY);
    }
  }, [data, invoiceId, send, shareContext]);

  const remove = useMutation({
    mutationFn: async () => invoiceService.delete(invoiceId),
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/invoices" });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const printInvoice = () => window.print();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const autoPrintId = window.sessionStorage.getItem("billflow_autoprint_invoice");
    if (autoPrintId !== invoiceId) return;
    window.sessionStorage.removeItem("billflow_autoprint_invoice");
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [invoiceId]);

  const statusAction = (status: InvoiceStatus) => {
    updateStatus.mutate(status);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="no-print flex flex-col gap-4">
        <Link
          to="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("dashboard.viewInvoices")}
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("invoice.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("invoice.preview")}</p>
          </div>
          {data && (
            <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Button
                variant="outline"
                onClick={() => send.mutate()}
                disabled={send.isPending}
                className="justify-center rounded-2xl border-amber-200/70 bg-white/70 text-slate-700 hover:bg-amber-50/70"
              >
                <Mail className="size-4 mr-2" /> {t("invoice.email")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!shareContext) return;
                  window.open(shareContext.whatsappUrl, "_blank", "noopener,noreferrer");
                }}
                disabled={!shareContext}
                className="justify-center rounded-2xl border-amber-200/70 bg-white/70 text-slate-700 hover:bg-amber-50/70"
              >
                <MessageCircleMore className="size-4 mr-2" /> {t("invoice.whatsapp")}
              </Button>
              <Button
                variant="outline"
                onClick={printInvoice}
                className="justify-center rounded-2xl border-amber-200/70 bg-white/70 text-slate-700 hover:bg-amber-50/70"
              >
                <Printer className="size-4 mr-2" /> {t("invoice.print")}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                className="justify-center rounded-2xl border-amber-200/70 bg-white/70 text-slate-700 hover:bg-amber-50/70"
              >
                <Copy className="size-4 mr-2" /> {t("common.copyLink")}
              </Button>
              <Button
                variant="outline"
                onClick={() => duplicate.mutate()}
                disabled={duplicate.isPending}
                className="justify-center rounded-2xl border-amber-200/70 bg-white/70 text-slate-700 hover:bg-amber-50/70"
              >
                <Download className="size-4 mr-2" /> {t("common.duplicate")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete invoice ${data.number}?`)) remove.mutate();
                }}
                className="justify-center rounded-2xl"
              >
                <Trash2 className="size-4 mr-2" /> {t("common.delete")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-2xl p-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <SkeletonText lines={4} />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : data ? (
        <div className="invoice-sheet rounded-[2rem] border border-amber-100/70 bg-[#fbf7f2] p-6 text-slate-800 shadow-[0_24px_60px_-30px_rgba(120,90,50,0.28)] print:shadow-none print:border-0 print:bg-white sm:p-8">
          {settings.data && (
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-amber-100 pb-5 print:border-black/15 print:pb-6">
              <div className="space-y-2">
                <div className="inline-flex rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 print:border-black/15 print:text-black/60">
                  Tax Invoice
                </div>
                <div>
                  <p className="text-3xl font-black tracking-tight text-slate-800 print:text-[22px]">
                    {settings.data.companyName}
                  </p>
                  {settings.data.legalName && (
                    <p className="text-sm text-slate-500 print:text-black/70">
                      {settings.data.legalName}
                    </p>
                  )}
                  {settings.data.email && (
                    <p className="text-sm text-slate-500 print:text-black/70">
                      {settings.data.email}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                {settings.data.logoUrl && (
                  <img src={settings.data.logoUrl} alt="Logo" className="h-14 object-contain" />
                )}
                <div className="rounded-2xl border border-amber-100 bg-white/80 px-4 py-3 text-left print:border-black/15 print:bg-white">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500 print:text-black/60">
                    Invoice No
                  </p>
                  <p className="text-xl font-bold text-slate-800 print:text-[18px]">
                    {data.number}
                  </p>
                  <p className="text-xs text-slate-500 print:text-black/60">
                    {formatDate(data.issueDate)}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-4 pb-6 border-b border-amber-100 lg:grid-cols-[1.4fr_1fr] print:border-black/15">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-slate-800">{data.number}</h1>
                <StatusBadge status={data.status} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-100 bg-white/80 p-3 print:border-black/15 print:bg-white">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500 print:text-black/60">
                    {t("invoices.issueDate")}
                  </p>
                  <p className="mt-1 font-semibold text-slate-700">{formatDate(data.issueDate)}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-white/80 p-3 print:border-black/15 print:bg-white">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500 print:text-black/60">
                    {t("invoices.dueDate")}
                  </p>
                  <p className="mt-1 font-semibold text-slate-700">{formatDate(data.dueDate)}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-white/80 p-3 print:border-black/15 print:bg-white">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500 print:text-black/60">
                    {t("invoices.status")}
                  </p>
                  <p className="mt-1 font-semibold capitalize text-slate-700">{data.status}</p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-white/85 p-4 text-right print:border-black/15 print:bg-white">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500 print:text-black/60">
                Grand Total
              </p>
              <div className="mt-2 text-4xl font-black tracking-tight text-amber-700 print:text-black">
                {formatCurrency(data.total, currency)}
              </div>
              <p className="text-xs text-slate-500 mt-2 print:text-black/60">
                {t("billing.tax")} {data.taxRate}% included
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 py-6 border-b border-amber-100 lg:grid-cols-[1.4fr_1fr] print:border-black/15">
            <div className="rounded-3xl border border-amber-100 bg-white/80 p-5 print:border-black/15 print:bg-white">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 mb-3 print:text-black/60">
                {t("clients.title")}
              </p>
              <p className="text-xl font-bold text-slate-800">{data.client?.name ?? "-"}</p>
              {data.client?.email && (
                <p className="mt-1 text-sm text-slate-500 print:text-black/70">
                  {data.client.email}
                </p>
              )}
              {data.client?.address && (
                <p className="mt-3 text-sm text-slate-500 whitespace-pre-line print:text-black/70">
                  {data.client.address}
                </p>
              )}
            </div>
            <div className="rounded-3xl border border-amber-100 bg-white/80 p-5 print:border-black/15 print:bg-white">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 mb-3 print:text-black/60">
                {t("invoice.preview")}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">{t("billing.subtotal")}</span>
                  <span>{formatCurrency(data.subtotal, currency)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">{t("billing.tax")}</span>
                  <span>{formatCurrency(data.tax, currency)}</span>
                </div>
                <div className="flex justify-between gap-3 pt-2 border-t border-amber-100 font-semibold">
                  <span>{t("billing.total")}</span>
                  <span>{formatCurrency(data.total, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="invoice-table w-full mt-2 text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500 print:text-black/60">
                <tr>
                  <th className="text-left pb-2">{t("common.description")}</th>
                  <th className="text-right pb-2 w-20">{t("billing.quantity")}</th>
                  <th className="text-right pb-2 w-28">{t("billing.unitPrice")}</th>
                  <th className="text-right pb-2 w-28">{t("billing.total")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => (
                  <tr key={i} className="border-t border-amber-100 print:border-black/10">
                    <td className="py-3">{it.description}</td>
                    <td className="py-3 text-right">{it.quantity}</td>
                    <td className="py-3 text-right">{formatCurrency(it.unitPrice, currency)}</td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(it.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 ml-auto w-full sm:w-80 rounded-3xl border border-amber-100 bg-white/85 p-4 shadow-sm print:border-black/15 print:bg-white">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">{t("billing.subtotal")}</span>
                <span>{formatCurrency(data.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">
                  {t("billing.tax")} ({data.taxRate}%)
                </span>
                <span>{formatCurrency(data.tax, currency)}</span>
              </div>
              <div className="flex justify-between gap-3 pt-3 border-t border-amber-100 font-semibold text-base">
                <span>{t("billing.total")}</span>
                <span>{formatCurrency(data.total, currency)}</span>
              </div>
            </div>
          </div>

          {data.notes && (
            <div className="mt-8 pt-6 border-t border-amber-100 print:border-black/15">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 print:text-black/60">
                {t("billing.notes")}
              </p>
              <p className="text-sm whitespace-pre-line text-slate-700">{data.notes}</p>
            </div>
          )}

          {settings.data?.footerMessage && (
            <div className="mt-8 pt-6 border-t border-amber-100 text-xs text-slate-500 print:text-[11px] print:border-black/15">
              {settings.data.footerMessage}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
