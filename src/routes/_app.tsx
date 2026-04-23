import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/authService";
import { useAuthStore } from "@/store/authStore";
import { useEffect } from "react";
import { getToken } from "@/services/api";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});

function AppShell() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);

  const { data } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authService.me,
    enabled: !user,
    retry: false,
  });

  useEffect(() => {
    if (data) setAuth(data, getToken());
  }, [data, setAuth]);

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
