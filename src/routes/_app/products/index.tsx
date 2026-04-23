import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Package, Trash2, Loader2, Pencil, Search } from "lucide-react";
import { productService } from "@/services/productService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { formatCurrency } from "@/utils/format";
import { toApiError } from "@/services/api";
import { toast } from "sonner";
import type { Product } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/products/")({
  component: ProductsPage,
});

const emptyForm: Partial<Product> = {
  name: "",
  sku: "",
  description: "",
  price: 0,
};

function ProductsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyForm);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["products", { search }],
    queryFn: () => productService.getAll({ search: search || undefined }),
  });

  const products = useMemo(() => data?.data ?? [], [data]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      description: product.description ?? "",
      price: product.price,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Product>) => {
      if (editingId) {
        return productService.update(editingId, payload);
      }
      return productService.create(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const del = useMutation({
    mutationFn: (id: string) => productService.delete(id),
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("products.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("products.subtitle")}</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={openCreate}
              className="bg-gradient-primary text-primary-foreground border-0 shadow-glow"
            >
              <Plus className="size-4 mr-2" /> {t("products.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("common.edit") : t("products.new")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  required
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("products.sku")}</Label>
                <Input
                  value={form.sku ?? ""}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("products.price")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.price ?? 0}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={save.isPending}
                  className="bg-gradient-primary text-primary-foreground border-0"
                >
                  {save.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editingId ? (
                    t("common.update")
                  ) : (
                    t("common.add")
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="glass-card rounded-2xl p-4">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("common.noData")}
          description={t("products.subtitle")}
          actionLabel={t("products.new")}
          onAction={openCreate}
        />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t("common.name")}</th>
                <th className="text-left font-medium px-4 py-3">{t("products.sku")}</th>
                <th className="text-left font-medium px-4 py-3">{t("common.description")}</th>
                <th className="text-right font-medium px-4 py-3">{t("products.price")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">
                    {p.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.price)}</td>
                  <td className="px-2 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          if (confirm(`Delete ${p.name}?`)) del.mutate(p.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
