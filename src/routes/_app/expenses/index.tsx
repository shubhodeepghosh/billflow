import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Receipt, Trash2, Loader2, Pencil, Search } from "lucide-react";
import { expenseService } from "@/services/expenseService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { formatCurrency, formatDate } from "@/utils/format";
import { toApiError } from "@/services/api";
import { toast } from "sonner";
import type { Expense } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/expenses/")({
  component: ExpensesPage,
});

const emptyForm: Partial<Expense> = {
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  category: "Other",
  description: "",
  vendor: "",
};

function ExpensesPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Expense>>(emptyForm);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["expenses", { search }],
    queryFn: () => expenseService.getAll({ search: search || undefined }),
  });

  const expenses = useMemo(() => data?.data ?? [], [data]);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm({
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      category: expense.category,
      vendor: expense.vendor ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Expense>) => {
      if (editingId) {
        return expenseService.update(editingId, payload);
      }
      return expenseService.create(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Expense updated" : "Expense added");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const del = useMutation({
    mutationFn: (id: string) => expenseService.delete(id),
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("expenses.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("expenses.subtitle")}{" "}
            {data && (
              <span className="font-medium text-foreground">Total: {formatCurrency(total)}</span>
            )}
          </p>
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
              <Plus className="size-4 mr-2" /> {t("expenses.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("common.edit") : t("expenses.new")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Input
                  required
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("invoices.amount")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.amount ?? 0}
                    onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.date")}</Label>
                  <Input
                    type="date"
                    required
                    value={form.date ?? ""}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("expenses.title")}</Label>
                  <Input
                    value={form.category ?? ""}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("clients.company")}</Label>
                  <Input
                    value={form.vendor ?? ""}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  />
                </div>
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
        <SkeletonTable rows={6} cols={6} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("common.noData")}
          description={t("expenses.subtitle")}
          actionLabel={t("expenses.new")}
          onAction={openCreate}
        />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">{t("common.date")}</th>
                <th className="text-left font-medium px-4 py-3">{t("common.description")}</th>
                <th className="text-left font-medium px-4 py-3">{t("expenses.title")}</th>
                <th className="text-left font-medium px-4 py-3">{t("clients.company")}</th>
                <th className="text-right font-medium px-4 py-3">{t("invoices.amount")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition">
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 font-medium">{e.description}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-accent/60 text-accent-foreground px-2 py-0.5 text-xs">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.vendor ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(e.amount)}</td>
                  <td className="px-2 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          if (confirm("Delete expense?")) del.mutate(e.id);
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
