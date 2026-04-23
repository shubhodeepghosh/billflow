import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services/authService";
import { useAuthStore } from "@/store/authStore";
import { toApiError } from "@/services/api";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { getToken } from "@/services/api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && getToken()) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await authService.login(email, password)
          : await authService.register(name, email, password);
      setAuth(res.user, res.token);
      toast.success(
        mode === "login"
          ? t("auth.signInSuccess").replace("{name}", res.user.name)
          : t("auth.signUpSuccess"),
      );
      navigate({ to: "/" });
    } catch (err) {
      const e = toApiError(err);
      toast.error(
        e.message || (mode === "login" ? t("auth.signInFailed") : t("auth.signUpFailed")),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <div className="size-12 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
            <Sparkles className="size-6" />
          </div>
        </div>
        <div className="mb-4 flex justify-center gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              language === "en" ? "bg-background shadow-sm" : "bg-muted/30"
            }`}
            onClick={() => setLanguage("en")}
          >
            {t("language.english")}
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              language === "bn" ? "bg-background shadow-sm" : "bg-muted/30"
            }`}
            onClick={() => setLanguage("bn")}
          >
            {t("language.bengali")}
          </button>
        </div>

        <div className="glass-card rounded-3xl p-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.fullName")}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={t("auth.fullName")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Link to="/login" className="text-xs text-primary hover:underline">
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary text-primary-foreground border-0 shadow-glow hover:opacity-90"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "login" ? (
                t("auth.signIn")
              ) : (
                t("auth.createAccount")
              )}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode((current) => (current === "login" ? "register" : "login"))}
            >
              {mode === "login" ? t("auth.firstTime") : t("auth.haveAccount")}
            </button>
            <Link to="/login" className="text-muted-foreground hover:text-foreground">
              {t("auth.reset")}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
