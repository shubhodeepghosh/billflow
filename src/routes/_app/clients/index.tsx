import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Users, Trash2, Loader2, Mail, Building2, Pencil } from "lucide-react";
import { clientService } from "@/services/clientService";
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
import { Skeleton } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { toApiError } from "@/services/api";
import { toast } from "sonner";
import type { Client } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/clients/")({
  component: ClientsPage,
});

const emptyForm: Partial<Client> = {
  name: "",
  email: "",
  company: "",
  phone: "",
  address: "",
};

function ClientsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyForm);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["clients", { search }],
    queryFn: () => clientService.getAll({ search: search || undefined, pageSize: 100 }),
  });

  const clients = useMemo(() => data?.data ?? [], [data]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      company: client.company ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Client>) => {
      if (editingId) {
        return clientService.update(editingId, payload);
      }
      return clientService.create(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Client updated" : "Client added");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const del = useMutation({
    mutationFn: (id: string) => clientService.delete(id),
    onSuccess: () => {
      toast.success("Client deleted");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("clients.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("clients.subtitle")}</p>
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
              <Plus className="size-4 mr-2" /> {t("clients.new")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("common.edit") : t("clients.new")}</DialogTitle>
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
                <Label>{t("clients.email")}</Label>
                <Input
                  type="email"
                  required
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("clients.company")}</Label>
                <Input
                  value={form.company ?? ""}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("clients.phone")}</Label>
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("clients.address")}</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
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
                    t("clients.new")
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("common.noData")}
          description={t("clients.subtitle")}
          actionLabel={t("clients.new")}
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <div key={c.id} className="glass-card rounded-2xl p-5 hover:shadow-lg transition group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-11 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    {c.company && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Building2 className="size-3" /> {c.company}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 group-hover:opacity-100 transition"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 group-hover:opacity-100 transition"
                    onClick={() => {
                      if (confirm(`Delete ${c.name}?`)) del.mutate(c.id);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1 truncate">
                  <Mail className="size-3.5 shrink-0" />
                  <span className="truncate">{c.email}</span>
                </div>
                {c.phone && <p className="text-xs">{c.phone}</p>}
                {c.address && <p className="text-xs whitespace-pre-line">{c.address}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
