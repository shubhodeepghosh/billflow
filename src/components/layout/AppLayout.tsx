import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BadgeDollarSign,
  FileText,
  Receipt,
  Menu,
  Moon,
  Sun,
  LogOut,
  Sparkles,
  Settings,
  Globe,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/authService";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WalkthroughDialog } from "@/components/help/WalkthroughDialog";
import { useI18n } from "@/lib/i18n";

const nav = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/billing", key: "nav.quickBill", icon: BadgeDollarSign },
  { to: "/invoices", key: "nav.invoices", icon: FileText },
  { to: "/expenses", key: "nav.expenses", icon: Receipt },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUIStore();
  const { language, setLanguage, t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    authService.logout();
    setAuth(null, null);
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl transition-all duration-300 sticky top-0 h-screen",
          sidebarCollapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="size-9 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-glow shrink-0">
            <Sparkles className="size-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{t("appName")}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {t("appTagline")}
              </span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                {!sidebarCollapsed && <span>{t(item.key)}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          {user && !sidebarCollapsed && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-sidebar-accent/50 mb-2">
              <div className="size-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn("w-full justify-start", sidebarCollapsed && "justify-center px-0")}
          >
            <LogOut className="size-4" />
            {!sidebarCollapsed && <span className="ml-2">{t("nav.signOut")}</span>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 md:px-6 border-b border-border bg-background/60 backdrop-blur-xl sticky top-0 z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="hidden md:inline-flex"
          >
            <Menu className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <Menu className="size-5" />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage("en")}
              className={cn(
                "h-8 rounded-full px-3 gap-1",
                language === "en" && "bg-background shadow-sm",
              )}
            >
              <Globe className="size-3.5" />
              {t("language.english")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage("bn")}
              className={cn(
                "h-8 rounded-full px-3 gap-1",
                language === "bn" && "bg-background shadow-sm",
              )}
            >
              <Globe className="size-3.5" />
              {t("language.bengali")}
            </Button>
          </div>
          <WalkthroughDialog />
        </header>

        <main className="flex-1 p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
