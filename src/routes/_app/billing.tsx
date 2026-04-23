import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Barcode, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { clientService } from "@/services/clientService";
import { invoiceService } from "@/services/invoiceService";
import { settingsService } from "@/services/settingsService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { formatCurrency } from "@/utils/format";
import { toast } from "sonner";
import { toApiError } from "@/services/api";
import type { InvoiceItem, InvoiceStatus } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/billing")({
  component: LiveBillingPage,
});

type FollowUpAction = "print" | "email" | "whatsapp";
const AUTOPRINT_KEY = "billflow_autoprint_invoice";
const FOLLOW_UP_KEY = "billflow_invoice_followup";

function LiveBillingPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsService.get,
  });

  const [customerName, setCustomerName] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState(18);
  const [followUpAction, setFollowUpAction] = useState<FollowUpAction>("print");
  const [targetEmail, setTargetEmail] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unitPrice: 0, total: 0 },
  ]);

  useEffect(() => {
    if (settings.data) {
      setTaxRate(settings.data.taxRate);
    }
  }, [settings.data]);

  const currency = settings.data?.currency ?? "INR";
  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPrice || 0), 0),
    [items],
  );
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.total = (next.quantity || 0) * (next.unitPrice || 0);
        return next;
      }),
    );
  };

  const finalize = useMutation({
    mutationFn: async (payload: { status: InvoiceStatus; followUp: FollowUpAction }) => {
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (items.length === 0 || items.some((item) => !item.description.trim())) {
        throw new Error("Add at least one bill item");
      }
      if (payload.followUp === "email" && !targetEmail.trim()) {
        throw new Error("Target email is required for email delivery");
      }
      if (payload.followUp === "whatsapp" && !targetPhone.trim()) {
        throw new Error("Target WhatsApp number is required");
      }
      const client = await clientService.create({
        name: customerName,
        email: payload.followUp === "email" ? targetEmail.trim() : targetEmail.trim() || "",
        phone: payload.followUp === "whatsapp" ? targetPhone.trim() : targetPhone.trim() || "",
        company: "Walk-in Customer",
      });
      return invoiceService.create({
        clientId: client.id,
        issueDate,
        dueDate: issueDate,
        status: payload.status,
        items,
        subtotal,
        taxRate,
        tax,
        total,
        notes: "Generated from live billing desk.",
      });
    },
    onSuccess: (invoice, variables) => {
      toast.success(`${t("billing.saved")} ${invoice.number}`);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(AUTOPRINT_KEY);
        if (variables.followUp === "print") {
          window.sessionStorage.setItem(AUTOPRINT_KEY, invoice.id);
        } else {
          window.sessionStorage.setItem(
            FOLLOW_UP_KEY,
            JSON.stringify({ invoiceId: invoice.id, action: variables.followUp }),
          );
        }
      }
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const reset = () => {
    setCustomerName("");
    setTargetEmail("");
    setTargetPhone("");
    setFollowUpAction("print");
    setItems([{ description: "", quantity: 1, unitPrice: 0, total: 0 }]);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("billing.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>
            {t("auth.reset")}
          </Button>
        </div>
      </header>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BadgeDollarSign className="size-4" />
              {t("billing.title")}
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>{t("billing.customer")}</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t("billing.customerWalkIn")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">{t("billing.items")}</h3>
                <p className="text-xs text-muted-foreground">Type item name directly.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, total: 0 }])
                }
              >
                <Plus className="size-4 mr-1" /> {t("billing.addItem")}
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start rounded-2xl border border-border p-3"
                >
                  <div className="col-span-12 md:col-span-6 space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("common.name")}</Label>
                    <Input
                      placeholder="Product or service name"
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">{t("billing.quantity")}</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={t("billing.quantity")}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("billing.unitPrice")}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={t("billing.unitPrice")}
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right pt-8 font-semibold">
                    {formatCurrency(item.total, currency)}
                  </div>
                  <div className="col-span-1 flex justify-end pt-6">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card rounded-3xl p-6 sticky top-24">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Barcode className="size-4" />
              {t("common.livePreview")}
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("billing.customer")}</p>
                <p className="font-semibold">{customerName || t("billing.customerWalkIn")}</p>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.description || "Item"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} x {formatCurrency(item.unitPrice, currency)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.total, currency)}</p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("billing.subtotal")}</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("billing.tax")} ({taxRate}%)
                  </span>
                  <span>{formatCurrency(tax, currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>{t("billing.total")}</span>
                  <span>{formatCurrency(total, currency)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-3xl border border-border bg-background/70 p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={followUpAction === "email" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setFollowUpAction("email")}
                >
                  {t("invoice.email")}
                </Button>
                <Button
                  type="button"
                  variant={followUpAction === "whatsapp" ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => setFollowUpAction("whatsapp")}
                >
                  {t("invoice.whatsapp")}
                </Button>
              </div>
              {followUpAction === "email" && (
                <div className="space-y-2">
                  <Label>{t("clients.email")}</Label>
                  <Input
                    type="email"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>
              )}
              {followUpAction === "whatsapp" && (
                <div className="space-y-2">
                  <Label>{t("clients.phone")}</Label>
                  <Input
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
              )}
              <Button
                className="w-full bg-gradient-primary text-primary-foreground border-0 shadow-glow"
                onClick={() => finalize.mutate({ status: "paid", followUp: followUpAction })}
                disabled={finalize.isPending}
              >
                {finalize.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span>
                    {followUpAction === "email"
                      ? t("billing.completeAndEmail")
                      : followUpAction === "whatsapp"
                        ? t("billing.completeAndWhatsapp")
                        : t("billing.completeAndPrint")}
                  </span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.print()}
              >
                <Printer className="size-4 mr-2" />
                {t("common.print")}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => finalize.mutate({ status: "draft", followUp: followUpAction })}
              >
                {t("common.draft")}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("billing.printHint")}</p>
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <h2>Bill preview</h2>
      </div>
    </div>
  );
}
