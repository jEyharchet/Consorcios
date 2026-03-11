import Link from "next/link";

import { getDerivedNotifications } from "../../lib/notifications";

function formatNotificationType(type: "SOLICITUD_ACCESO") {
  if (type === "SOLICITUD_ACCESO") {
    return "Solicitud de acceso";
  }

  return type;
}

export default async function NotificacionesPage() {
  const { pendingCount, notifications } = await getDerivedNotifications();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/" className="text-blue-600 hover:underline">
          Volver al inicio
        </Link>
        <h1 className="text-3xl font-semibold text-slate-900">Notificaciones</h1>
        <p className="text-slate-600">Tienes {pendingCount} notificaciones pendientes para gestionar.</p>
      </header>

      {notifications.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">No hay notificaciones pendientes por ahora.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {notifications.map((notification) => (
            <article key={notification.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {formatNotificationType(notification.type)}
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">{notification.consorcioNombre}</h2>
                  <p className="text-sm text-slate-600">
                    Usuario solicitante: {notification.requesterName ?? notification.requesterEmail ?? "Usuario no disponible"}
                  </p>
                  <p className="text-sm text-slate-500">Fecha: {notification.requestedAt.toLocaleDateString()}</p>
                </div>

                <Link
                  href={notification.href}
                  className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Gestionar solicitud
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
