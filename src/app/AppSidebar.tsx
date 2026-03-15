"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type SidebarItem = {
  label: string;
  href: string;
  match: "exact" | "prefix";
};

type ConsorcioOption = {
  id: number;
  nombre: string;
};

const baseItems: SidebarItem[] = [
  { label: "Resumen", href: "/", match: "exact" },
  { label: "Consorcios", href: "/consorcios", match: "prefix" },
  { label: "Unidades", href: "/unidades", match: "prefix" },
  { label: "Personas", href: "/personas", match: "prefix" },
  { label: "Proveedores", href: "/proveedores", match: "prefix" },
  { label: "Gastos", href: "/gastos", match: "prefix" },
  { label: "Reporte de gastos", href: "/gastos/reporte", match: "prefix" },
  { label: "Liquidaciones", href: "/liquidaciones", match: "prefix" },
  { label: "Expensas", href: "/expensas", match: "prefix" },
  { label: "Tesoreria", href: "/tesoreria", match: "prefix" },
  { label: "Administracion", href: "/administracion", match: "prefix" },
];

function matchesPath(pathname: string, item: SidebarItem) {
  if (item.match === "exact") {
    return pathname === item.href;
  }

  if (item.href === "/") {
    return pathname === "/";
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function compactLabel(label: string) {
  return label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function persistActiveConsorcio(consorcioId: string) {
  const parsed = Number(consorcioId);
  const payload = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  await fetch("/api/consorcio-activo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consorcioId: payload }),
  });
}

export default function AppSidebar({
  canSeeUsuarios,
  consorcios,
  activeConsorcioId,
  shouldPersistActive,
}: {
  canSeeUsuarios: boolean;
  consorcios: ConsorcioOption[];
  activeConsorcioId: number | null;
  shouldPersistActive: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedConsorcioId, setSelectedConsorcioId] = useState(String(activeConsorcioId ?? ""));

  useEffect(() => {
    setSelectedConsorcioId(String(activeConsorcioId ?? ""));
  }, [activeConsorcioId]);

  useEffect(() => {
    if (!shouldPersistActive || !activeConsorcioId) {
      return;
    }

    startTransition(async () => {
      await persistActiveConsorcio(String(activeConsorcioId));
      router.refresh();
    });
  }, [activeConsorcioId, shouldPersistActive, router]);

  const items = useMemo(() => {
    if (!canSeeUsuarios) {
      return baseItems;
    }

    return [...baseItems, { label: "Usuarios", href: "/usuarios", match: "prefix" as const }];
  }, [canSeeUsuarios]);

  const activeHref = useMemo(() => {
    const matches = items.filter((item) => matchesPath(pathname, item));

    if (matches.length === 0) {
      return "";
    }

    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0].href;
  }, [items, pathname]);

  return (
    <aside
      className={`${collapsed ? "w-20" : "w-64"} h-full shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200`}
      aria-label="Menu lateral"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            {!collapsed ? (
              <Link href="/" className="flex min-w-0 items-center">
                <Image
                  src="/branding/logo-color.png"
                  alt="AmiConsorcio"
                  width={180}
                  height={60}
                  priority
                  className="h-auto w-[150px]"
                />
              </Link>
            ) : (
              <Link href="/" className="mx-auto flex items-center justify-center">
                <Image
                  src="/branding/logo-color.png"
                  alt="AmiConsorcio"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-md object-contain"
                />
              </Link>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {collapsed ? ">>" : "<<"}
            </button>
          </div>

          {!collapsed ? (
            <form onSubmit={(event) => event.preventDefault()} className="space-y-1">
              <label htmlFor="activeConsorcio" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Consorcio activo
              </label>
              <select
                id="activeConsorcio"
                value={selectedConsorcioId}
                disabled={isPending || consorcios.length === 0}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedConsorcioId(value);

                  startTransition(async () => {
                    await persistActiveConsorcio(value);
                    router.refresh();
                  });
                }}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-700"
              >
                {consorcios.map((consorcio) => (
                  <option key={consorcio.id} value={consorcio.id}>
                    {consorcio.nombre}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((item) => {
            const active = activeHref === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
                title={collapsed ? item.label : undefined}
              >
                {collapsed ? (
                  <span className="inline-flex w-6 items-center justify-center text-xs font-semibold">{compactLabel(item.label)}</span>
                ) : null}
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
