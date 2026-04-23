import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CheckCircle2,
  Clock,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { analyticsService } from "@/services/analyticsService";
import { SkeletonCard, Skeleton } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { formatCurrency, formatNumber } from "@/utils/format";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const STATUS_COLORS: Record<string, string> = {
  paid: "oklch(0.65 0.17 155)",
  sent: "oklch(0.65 0.16 230)",
  draft: "oklch(0.70 0.02 260)",
  overdue: "oklch(0.58 0.24 27)",
  cancelled: "oklch(0.50 0.02 260)",
};

function DashboardPage() {
  const { t } = useI18n();
  const overview = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: analyticsService.overview,
  });
  const revenue = useQuery({
    queryKey: ["analytics", "revenue", "30d"],
    queryFn: () => analyticsService.revenue("30d"),
  });
  const status = useQuery({
    queryKey: ["analytics", "invoice-status"],
    queryFn: analyticsService.invoiceStatus,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          to="/invoices"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          {t("dashboard.viewInvoices")} <ArrowRight className="size-4" />
        </Link>
      </header>

      {/* KPI cards */}
      {overview.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : overview.isError ? (
        <ErrorState
          onRetry={() => overview.refetch()}
          message="Couldn't load analytics overview."
        />
      ) : overview.data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={t("dashboard.totalRevenue")}
            value={formatCurrency(overview.data.totalRevenue)}
            change={overview.data.revenueChange}
            icon={DollarSign}
            accent="primary"
          />
          <KpiCard
            label={t("dashboard.paidInvoices")}
            value={formatNumber(overview.data.paidInvoices)}
            icon={CheckCircle2}
            accent="success"
          />
          <KpiCard
            label={t("dashboard.pending")}
            value={formatNumber(overview.data.pendingInvoices)}
            icon={Clock}
            accent="info"
          />
          <KpiCard
            label={t("dashboard.totalExpenses")}
            value={formatCurrency(overview.data.totalExpenses)}
            change={overview.data.expensesChange}
            icon={Receipt}
            accent="warning"
            invertChange
          />
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">{t("dashboard.revenueChart")}</h3>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
          </div>
          {revenue.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : revenue.isError ? (
            <ErrorState onRetry={() => revenue.refetch()} />
          ) : !revenue.data || revenue.data.length === 0 ? (
            <EmptyState title={t("common.noData")} description={t("dashboard.noRevenue")} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenue.data}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.52 0.22 265)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.52 0.22 265)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.92 0.01 260)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="oklch(0.52 0.03 260)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="oklch(0.52 0.03 260)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="oklch(0.52 0.22 265)"
                  fillOpacity={1}
                  fill="url(#rev)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="oklch(0.78 0.16 75)"
                  fillOpacity={1}
                  fill="url(#exp)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold">{t("dashboard.statusChart")}</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribution</p>
          {status.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : status.isError ? (
            <ErrorState onRetry={() => status.refetch()} />
          ) : !status.data || status.data.length === 0 ? (
            <EmptyState
              title={t("dashboard.noInvoices")}
              description={t("dashboard.noInvoicesDesc")}
            />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={status.data}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {status.data.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {status.data.map((s) => (
                  <div key={s.status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: STATUS_COLORS[s.status] }}
                      />
                      <span className="capitalize">{s.status}</span>
                    </div>
                    <span className="font-medium">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  accent,
  invertChange,
}: {
  label: string;
  value: string;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "success" | "info" | "warning";
  invertChange?: boolean;
}) {
  const accentBg = {
    primary: "bg-gradient-primary text-primary-foreground",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
    warning: "bg-warning/15 text-warning",
  }[accent];

  const isUp = (change ?? 0) >= 0;
  const positive = invertChange ? !isUp : isUp;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={cn("size-9 rounded-xl flex items-center justify-center", accentBg)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
      {typeof change === "number" && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            positive ? "text-success" : "text-destructive",
          )}
        >
          {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {Math.abs(change).toFixed(1)}% vs last period
        </div>
      )}
    </motion.div>
  );
}
