import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Search,
  Plus,
  FileText,
  MoreHorizontal,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  XCircle,
  Clock3,
} from "lucide-react";
import { invoiceService } from "@/services/invoiceService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SkeletonTable } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/utils/format";
import { toApiError } from "@/services/api";
import { toast } from "sonner";
import type { InvoiceStatus } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesPage,
});

const PAGE_SIZE = 10;

function InvoicesPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoices", { page, search, status }],
    queryFn: () =>
      invoiceService.getAll({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      invoiceService.update(id, { status }),
    onSuccess: () => {
      toast.success("Invoice updated");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const del = useMutation({
    mutationFn: (id: string) => invoiceService.delete(id),
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("invoices.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("invoices.subtitle")}</p>
        </div>
        <Link
          to="/invoices/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-glow hover:opacity-90 transition"
        >
          <Plus className="size-4" /> {t("invoices.new")}
        </Link>
      </header>

      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder={t("invoices.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} message="Couldn't load invoices." />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("invoices.noData")}
          description={t("invoices.noDataDesc")}
          actionLabel={t("invoices.new")}
          onAction={() => {
            window.location.href = "/invoices/new";
          }}
        />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">{t("invoice.title")}</th>
                  <th className="text-left font-medium px-4 py-3">{t("clients.title")}</th>
                  <th className="text-left font-medium px-4 py-3">{t("invoices.issueDate")}</th>
                  <th className="text-left font-medium px-4 py-3">{t("invoices.dueDate")}</th>
                  <th className="text-left font-medium px-4 py-3">{t("invoices.status")}</th>
                  <th className="text-right font-medium px-4 py-3">{t("invoices.amount")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((inv) => (
                  <tr key={inv.id} className="border-t border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium">{inv.number}</td>
                    <td className="px-4 py-3">{inv.client?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(inv.total)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }}>
                              <Eye className="size-4 mr-2" /> {t("common.view")}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "draft" })}
                          >
                            <Clock3 className="size-4 mr-2" /> {t("common.draft")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "sent" })}
                          >
                            <Send className="size-4 mr-2" /> {t("common.send")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "paid" })}
                          >
                            <CheckCircle2 className="size-4 mr-2" /> Mark paid
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "overdue" })}
                          >
                            <Clock3 className="size-4 mr-2" /> Mark overdue
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => updateStatus.mutate({ id: inv.id, status: "cancelled" })}
                          >
                            <XCircle className="size-4 mr-2" /> Cancel
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm(`Delete invoice ${inv.number}?`)) del.mutate(inv.id);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="size-4 mr-2" /> {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.total)} of{" "}
              {data.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
