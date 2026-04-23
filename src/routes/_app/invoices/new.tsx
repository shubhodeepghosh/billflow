import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clientService } from "@/services/clientService";
import { productService } from "@/services/productService";
import { invoiceService } from "@/services/invoiceService";
import { settingsService } from "@/services/settingsService";
import { formatCurrency } from "@/utils/format";
import { toApiError } from "@/services/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/states/SkeletonLoader";
import type { InvoiceItem, InvoiceStatus } from "@/types";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/invoices/new")({
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const clients = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => clientService.getAll({ pageSize: 200 }),
  });
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productService.getAll(),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsService.get,
  });
  const currency = settings.data?.currency ?? "INR";

  const [clientId, setClientId] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [taxRate, setTaxRate] = useState(18);
  const [notes, setNotes] = useState("Thank you for your business.");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unitPrice: 0, total: 0 },
  ]);

  useEffect(() => {
    if (settings.data) {
      setTaxRate(settings.data.taxRate);
      setNotes((prev) => prev || settings.data.footerMessage);
    }
  }, [settings.data]);

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

  const fillFromProduct = (idx: number, productId: string) => {
    const product = products.data?.data.find((x) => x.id === productId);
    if (!product) return;
    updateItem(idx, {
      productId: product.id,
      description: product.name,
      unitPrice: product.price,
    });
  };

  const create = useMutation({
    mutationFn: invoiceService.create,
    onSuccess: () => {
      toast.success("Invoice created");
      navigate({ to: "/invoices" });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error("Please select a client");
      return;
    }
    if (items.length === 0 || items.some((i) => !i.description)) {
      toast.error("Please add at least one item with a description");
      return;
    }
    create.mutate({
      clientId,
      issueDate,
      dueDate,
      items,
      subtotal,
      taxRate,
      tax,
      total,
      notes,
      status,
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <Link
          to="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("dashboard.viewInvoices")}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-2">{t("invoices.new")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card rounded-2xl p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("clients.title")}</Label>
            {clients.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("common.selectClient")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.data?.data.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {t("common.noData")}
                    </div>
                  ) : (
                    clients.data?.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("invoices.issueDate")}</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("invoices.dueDate")}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("invoices.status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
              <SelectTrigger>
                <SelectValue placeholder={t("invoices.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t("billing.items")}</h3>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0, total: 0 }])
                }
              >
                <Plus className="size-4 mr-1" /> {t("billing.addItem")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (products.data?.data[0]) {
                    setItems((prev) => [
                      ...prev,
                      {
                        productId: products.data!.data[0].id,
                        description: products.data!.data[0].name,
                        quantity: 1,
                        unitPrice: products.data!.data[0].price,
                        total: products.data!.data[0].price,
                      },
                    ]);
                  }
                }}
              >
                <Wand2 className="size-4 mr-1" /> {t("common.view")}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 md:col-span-5 space-y-2">
                  {products.isLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (products.data?.data.length ?? 0) > 0 ? (
                    <Select
                      value={item.productId ?? ""}
                      onValueChange={(pid) => fillFromProduct(idx, pid)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.selectProduct")} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.data?.data.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input
                    placeholder={t("common.description")}
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder={t("billing.quantity")}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
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
                <div className="col-span-3 md:col-span-2 text-right pt-2 font-medium text-sm">
                  {formatCurrency(item.total, currency)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{t("billing.notes")}</Label>
              <Textarea
                placeholder="Payment terms, thank-you message..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("billing.subtotal")}</span>
                <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("billing.tax")}</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <span className="font-medium">{formatCurrency(tax, currency)}</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="font-semibold">{t("billing.total")}</span>
                <span className="text-2xl font-bold text-gradient">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/invoices" })}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            className="bg-gradient-primary text-primary-foreground border-0 shadow-glow"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : t("common.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
