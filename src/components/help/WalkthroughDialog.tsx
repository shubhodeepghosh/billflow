import { Link } from "@tanstack/react-router";
import { HelpCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function WalkthroughDialog() {
  const { t } = useI18n();

  const steps = [
    { title: t("walkthrough.step1"), to: "/login" },
    { title: t("walkthrough.step2"), to: "/settings" },
    { title: t("walkthrough.step3"), to: "/clients" },
    { title: t("walkthrough.step4"), to: "/billing" },
    { title: t("walkthrough.step5"), to: "/invoices" },
    { title: t("walkthrough.step6"), to: "/invoices" },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <HelpCircle className="size-4" />
          <span className="hidden sm:inline">{t("nav.help")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("walkthrough.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("walkthrough.subtitle")}</p>
        </DialogHeader>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <Link
              key={step.title}
              to={step.to}
              className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="size-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="size-4 text-success" />
                  <span>{step.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-primary">
                  {t("common.view")}
                  <ArrowRight className="size-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
