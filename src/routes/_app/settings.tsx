import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, ImagePlus, Loader2, Palette } from "lucide-react";
import { settingsService } from "@/services/settingsService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/states/SkeletonLoader";
import { ErrorState } from "@/components/states/ErrorState";
import { toast } from "sonner";
import { toApiError } from "@/services/api";
import { backupService } from "@/services/backupService";
import type { AppSettings } from "@/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const currencies = ["INR"];

function SettingsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: settingsService.get,
  });

  const [form, setForm] = useState<AppSettings | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  useEffect(() => {
    if (query.data) {
      setForm(query.data);
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: settingsService.update,
    onSuccess: (data) => {
      toast.success(t("common.save"));
      qc.setQueryData(["settings"], data);
      setForm(data);
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateField("logoUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const downloadBackup = async () => {
    const snapshot = await backupService.export();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billflow-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(t("settings.downloaded"));
  };

  const restoreBackup = async (file: File | null) => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text) as Parameters<typeof backupService.restore>[0];
      if (!window.confirm("This will replace the current workspace. Continue?")) return;
      const restored = await backupService.restore(snapshot);
      qc.setQueryData(["settings"], restored.settings);
      setForm(restored.settings as AppSettings);
      toast.success(t("settings.restored"));
      window.location.reload();
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </header>

      {query.isLoading || !form ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="h-[500px] lg:col-span-2 rounded-3xl" />
          <Skeleton className="h-[500px] rounded-3xl" />
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} message="Couldn't load settings." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="glass-card rounded-3xl p-6 lg:col-span-2 space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4" />
                {t("settings.companyProfile")}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("settings.companyName")}</Label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.legalName")}</Label>
                  <Input
                    value={form.legalName ?? ""}
                    onChange={(e) => updateField("legalName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("clients.email")}</Label>
                  <Input
                    value={form.email ?? ""}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("clients.phone")}</Label>
                  <Input
                    value={form.phone ?? ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("clients.address")}</Label>
                  <Textarea
                    rows={3}
                    value={form.address ?? ""}
                    onChange={(e) => updateField("address", e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("settings.website")}</Label>
                  <Input
                    value={form.website ?? ""}
                    onChange={(e) => updateField("website", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="size-4" />
                {t("settings.billingDefaults")}
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("settings.currency")}</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(value) => updateField("currency", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("settings.currency")} />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.taxRate")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.taxRate}
                    onChange={(e) => updateField("taxRate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.invoicePrefix")}</Label>
                  <Input
                    value={form.invoicePrefix}
                    onChange={(e) => updateField("invoicePrefix", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.nextInvoiceNumber")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.nextInvoiceNumber}
                    onChange={(e) =>
                      updateField("nextInvoiceNumber", parseInt(e.target.value, 10) || 1)
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("settings.paymentTerms")}</Label>
                  <Input
                    value={form.paymentTerms}
                    onChange={(e) => updateField("paymentTerms", e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>{t("settings.footerMessage")}</Label>
                  <Textarea
                    rows={3}
                    value={form.footerMessage}
                    onChange={(e) => updateField("footerMessage", e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="size-4" />
                {t("settings.emailDelivery")}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("settings.smtpHost")}</Label>
                  <Input
                    value={form.smtpHost ?? ""}
                    onChange={(e) => updateField("smtpHost", e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.smtpPort")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.smtpPort ?? 465}
                    onChange={(e) => updateField("smtpPort", parseInt(e.target.value, 10) || 465)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.smtpUser")}</Label>
                  <Input
                    value={form.smtpUser ?? ""}
                    onChange={(e) => updateField("smtpUser", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.smtpPassword")}</Label>
                  <Input
                    type="password"
                    value={form.smtpPassword ?? ""}
                    onChange={(e) => updateField("smtpPassword", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.smtpFromEmail")}</Label>
                  <Input
                    type="email"
                    value={form.smtpFromEmail ?? ""}
                    onChange={(e) => updateField("smtpFromEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.smtpFromName")}</Label>
                  <Input
                    value={form.smtpFromName ?? ""}
                    onChange={(e) => updateField("smtpFromName", e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.smtpSecure ?? true}
                    onChange={(e) => updateField("smtpSecure", e.target.checked)}
                    className="size-4"
                  />
                  <span className="text-sm">{t("settings.smtpSecure")}</span>
                </label>
              </div>
            </section>

            <div className="flex items-center justify-end">
              <Button
                onClick={() => save.mutate(form)}
                disabled={save.isPending}
                className="bg-gradient-primary text-primary-foreground border-0 shadow-glow"
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
              </Button>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImagePlus className="size-4" />
              {t("settings.logoPreview")}
            </div>
            <div className="rounded-2xl border border-dashed border-border p-4 text-center">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt="Company logo"
                  className="mx-auto max-h-28 object-contain"
                />
              ) : (
                <div className="py-8 text-sm text-muted-foreground">
                  Upload a logo for invoices and printouts.
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Logo image</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="rounded-2xl border border-border p-4 bg-muted/20 text-sm space-y-1">
              <div className="font-semibold">{form.companyName}</div>
              <div className="text-muted-foreground">{form.email ?? "No email set"}</div>
              <div className="text-muted-foreground">
                {form.currency} | Tax {form.taxRate}%
              </div>
              <div className="text-muted-foreground">{form.invoicePrefix}-YYYY-0001</div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {t("settings.backupTitle")}
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.restoreHint")}</p>
              <div className="grid gap-2">
                <Button variant="outline" onClick={downloadBackup}>
                  {t("settings.exportBackup")}
                </Button>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/30">
                  <span>{restoreBusy ? "Restoring..." : t("settings.importBackup")}</span>
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    disabled={restoreBusy}
                    onChange={(e) => restoreBackup(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
