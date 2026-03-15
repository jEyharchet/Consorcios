import type { Metadata } from "next";
import Link from "next/link";

import { auth, signOut } from "../../auth";
import { getCurrentUserFromSession } from "../lib/auth";
import { getActiveConsorcioContext } from "../lib/consorcio-activo";
import { getDerivedNotifications } from "../lib/notifications";
import { onboardingRequired } from "../lib/onboarding";
import AppSidebar from "./AppSidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "AmiConsorcio",
  description: "Gestion operativa para administracion de consorcios.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, currentUser] = await Promise.all([auth(), getCurrentUserFromSession()]);
  const hasValidAppUser = Boolean(session?.user && currentUser);

  let sidebarContext: Awaited<ReturnType<typeof getActiveConsorcioContext>> | null = null;
  let notificationCount = 0;

  if (hasValidAppUser) {
    const [activeContext, notifications] = await Promise.all([
      getActiveConsorcioContext(),
      getDerivedNotifications(),
    ]);

    sidebarContext = activeContext;
    notificationCount = notifications.pendingCount;
  }

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const shouldShowSidebar = hasValidAppUser && sidebarContext ? !onboardingRequired(sidebarContext.access) : false;
  const notificationClass =
    notificationCount > 0
      ? "border-red-600 bg-red-600 text-white"
      : "border-slate-300 bg-white text-slate-500";

  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900">
        {hasValidAppUser ? (
          <div className="flex h-screen flex-col overflow-hidden">
            <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-none items-center justify-between px-6 py-3">
                <Link href="/" className="text-sm font-medium text-slate-700 hover:text-slate-900">
                  AmiConsorcio
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">{currentUser?.email ?? session?.user?.email ?? "Usuario"}</span>
                  <Link
                    href="/notificaciones"
                    className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold transition hover:border-slate-400 ${notificationClass}`}
                    title={notificationCount > 0 ? `${notificationCount} notificaciones pendientes` : "Sin notificaciones pendientes"}
                    aria-label={notificationCount > 0 ? `${notificationCount} notificaciones pendientes` : "Sin notificaciones pendientes"}
                  >
                    {notificationCount > 0 ? notificationCount : ""}
                  </Link>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Cerrar sesion
                    </button>
                  </form>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              {shouldShowSidebar ? (
                <AppSidebar
                  canSeeUsuarios={Boolean(isSuperAdmin)}
                  consorcios={sidebarContext?.consorcios ?? []}
                  activeConsorcioId={sidebarContext?.activeConsorcioId ?? null}
                  shouldPersistActive={sidebarContext?.shouldPersist ?? false}
                />
              ) : null}
              <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
