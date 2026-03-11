import type { Metadata } from "next";
import Link from "next/link";

import { auth, signOut } from "../../auth";
import { getActiveConsorcioContext } from "../lib/consorcio-activo";
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
  const session = await auth();

  let sidebarContext: Awaited<ReturnType<typeof getActiveConsorcioContext>> | null = null;
  if (session?.user) {
    sidebarContext = await getActiveConsorcioContext();
  }

  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const shouldShowSidebar = session?.user && sidebarContext ? !onboardingRequired(sidebarContext.access) : false;

  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900">
        {session?.user ? (
          <div className="flex h-screen flex-col overflow-hidden">
            <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white">
              <div className="mx-auto flex w-full max-w-none items-center justify-between px-6 py-3">
                <Link href="/" className="text-sm font-medium text-slate-700 hover:text-slate-900">
                  AmiConsorcio
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">{session.user.email ?? "Usuario"}</span>
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
