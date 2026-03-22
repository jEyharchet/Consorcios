import Link from "next/link";
import { redirect } from "next/navigation";

import { getAccessContext } from "../../lib/auth";
import { ONBOARDING_PATH } from "../../lib/onboarding";
import { prisma } from "../../lib/prisma";
import { createConsorcioFromOnboarding, createPersonaForOnboarding, requestConsorcioAccess } from "./actions";

type OnboardingPageProps = {
  searchParams?: { tab?: string; q?: string; error?: string; ok?: string };
};

function getMessage(error?: string, ok?: string) {
  if (error === "missing_persona_fields") return { type: "error", text: "Completa al menos nombre y apellido para crear tu persona." };
  if (error === "persona_required") return { type: "error", text: "Primero necesitamos vincular tu usuario a una persona." };
  if (error === "consorcio_invalido") return { type: "error", text: "Selecciona un consorcio valido para solicitar integracion." };
  if (error === "already_member") return { type: "error", text: "Tu persona ya tiene una relacion valida con ese consorcio." };
  if (error === "duplicate_pending") return { type: "error", text: "Ya existe una solicitud pendiente para ese consorcio." };
  if (error === "missing_fields") return { type: "error", text: "Completa los datos personales y los datos basicos del consorcio." };
  if (ok === "persona_ready") return { type: "ok", text: "Tu persona quedo vinculada correctamente. Ahora puedes solicitar integracion o crear un consorcio." };
  if (ok === "request_sent") return { type: "ok", text: "La solicitud de integracion se registro y quedo pendiente de aprobacion." };

  return null;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const access = await getAccessContext();

  if (access.isSuperAdmin || access.allowedConsorcioIds.length > 0) {
    redirect("/");
  }

  const tab = searchParams?.tab === "create" ? "create" : "join";
  const q = (searchParams?.q ?? "").trim();
  const message = getMessage(searchParams?.error, searchParams?.ok);

  const user = await prisma.user.findUnique({
    where: { id: access.user.id },
    select: {
      email: true,
      name: true,
      persona: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
          telefono: true,
        },
      },
    },
  });

  const [defaultNombre, defaultApellido] = (() => {
    if (user?.persona?.nombre && user.persona.apellido) {
      return [user.persona.nombre, user.persona.apellido];
    }

    const rawName = user?.name?.trim() ?? "";
    if (!rawName) {
      return ["", ""];
    }

    const [first, ...rest] = rawName.split(/\s+/);
    return [first ?? "", rest.join(" ")];
  })();

  const defaultUserEmail = user?.email ?? "";

  if (!user?.persona) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">AmiConsorcio</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Primero vinculemos tu persona</h1>
          <p className="text-lg text-slate-600">
            El acceso a los consorcios ahora se determina por la persona y sus relaciones reales. Antes de continuar, necesitamos crear o completar tu persona.
          </p>
        </header>

        {message ? (
          <div
            className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
              message.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form action={createPersonaForOnboarding} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="nombre" className="text-sm font-medium text-slate-700">Nombre</label>
                <input id="nombre" name="nombre" required defaultValue={defaultNombre} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="apellido" className="text-sm font-medium text-slate-700">Apellido</label>
                <input id="apellido" name="apellido" required defaultValue={defaultApellido} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={defaultUserEmail}
                  readOnly={Boolean(defaultUserEmail)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2 read-only:bg-slate-50 read-only:text-slate-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="telefono" className="text-sm font-medium text-slate-700">Telefono</label>
                <input id="telefono" name="telefono" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
              </div>
            </div>

            <button type="submit" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
              Guardar persona y continuar
            </button>
          </form>
        </section>
      </main>
    );
  }

  const consorcios =
    q.length < 2
      ? []
      : await prisma.consorcio.findMany({
          where: {
            nombre: {
              contains: q,
              mode: "insensitive",
            },
          },
          orderBy: { nombre: "asc" },
          take: 20,
          select: {
            id: true,
            nombre: true,
            direccion: true,
            ciudad: true,
          },
        });

  const pendingRequestIds = new Set(
    consorcios.length === 0
      ? []
      : (
          await prisma.solicitudAccesoConsorcio.findMany({
            where: {
              estado: "PENDIENTE",
              consorcioId: { in: consorcios.map((consorcio) => consorcio.id) },
              OR: [{ personaId: user.persona.id }, { userId: access.user.id }],
            },
            select: { consorcioId: true },
          })
        ).map((item) => item.consorcioId)
  );

  const assignedConsorcioIds = new Set(access.allowedConsorcioIds);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">AmiConsorcio</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Configura tu primer acceso</h1>
        <p className="text-lg text-slate-600">
          Tu persona ya esta vinculada, pero todavia no tiene una relacion valida con ningun consorcio. Puedes solicitar integracion a uno existente o crear uno nuevo como administrador.
        </p>
      </header>

      {message ? (
        <div
          className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Elegir camino</p>
          <div className="mt-4 space-y-3">
            <Link
              href={`${ONBOARDING_PATH}?tab=join${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`block rounded-xl border px-4 py-3 text-sm transition ${
                tab === "join" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              Quiero integrarme a un consorcio
            </Link>
            <Link
              href={`${ONBOARDING_PATH}?tab=create`}
              className={`block rounded-xl border px-4 py-3 text-sm transition ${
                tab === "create" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              Quiero crear un consorcio
            </Link>
          </div>
        </aside>

        {tab === "join" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-900">Buscar un consorcio existente</h2>
              <p className="text-sm text-slate-600">Escribe al menos 2 letras del nombre y envia una solicitud para que un administrador pueda integrar tu persona a una unidad.</p>
            </header>

            <form method="GET" className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input type="hidden" name="tab" value="join" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Ej: Torres del Parque"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none ring-slate-400 focus:ring-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Buscar
              </button>
            </form>

            {q.length < 2 ? (
              <p className="mt-6 text-sm text-slate-500">Ingresa al menos 2 letras para comenzar la busqueda.</p>
            ) : consorcios.length === 0 ? (
              <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No encontramos consorcios con ese nombre.
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                {consorcios.map((consorcio) => {
                  const hasPending = pendingRequestIds.has(consorcio.id);
                  const alreadyAssigned = assignedConsorcioIds.has(consorcio.id);

                  return (
                    <article key={consorcio.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{consorcio.nombre}</h3>
                          <p className="mt-1 text-sm text-slate-600">{consorcio.direccion}</p>
                          {consorcio.ciudad ? <p className="text-sm text-slate-500">{consorcio.ciudad}</p> : null}
                        </div>

                        <form action={requestConsorcioAccess} className="w-full max-w-md space-y-3">
                          <input type="hidden" name="consorcioId" value={consorcio.id} />
                          <input type="hidden" name="q" value={q} />
                          <textarea
                            name="mensaje"
                            rows={2}
                            placeholder="Mensaje opcional para el administrador"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2"
                          />
                          <button
                            type="submit"
                            disabled={hasPending || alreadyAssigned}
                            className={`rounded-lg px-4 py-2 text-sm font-medium ${
                              hasPending || alreadyAssigned
                                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                          >
                            {alreadyAssigned ? "Ya tienes acceso" : hasPending ? "Solicitud pendiente" : "Solicitar integracion"}
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-900">Crear un consorcio nuevo</h2>
              <p className="text-sm text-slate-600">Actualizaremos tu persona si hace falta, crearemos el consorcio y te asociaremos como administradora o administrador.</p>
            </header>

            <form action={createConsorcioFromOnboarding} className="mt-6 space-y-6">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tus datos</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="nombre" className="text-sm font-medium text-slate-700">Nombre</label>
                    <input id="nombre" name="nombre" required defaultValue={user.persona.nombre} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="apellido" className="text-sm font-medium text-slate-700">Apellido</label>
                    <input id="apellido" name="apellido" required defaultValue={user.persona.apellido} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={user.persona.email ?? user.email ?? ""}
                      readOnly={Boolean(user.email)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2 read-only:bg-slate-50 read-only:text-slate-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="telefono" className="text-sm font-medium text-slate-700">Telefono</label>
                    <input id="telefono" name="telefono" defaultValue={user.persona.telefono ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Datos del consorcio</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="consorcioNombre" className="text-sm font-medium text-slate-700">Nombre</label>
                    <input id="consorcioNombre" name="consorcioNombre" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="tituloLegal" className="text-sm font-medium text-slate-700">Titulo legal</label>
                    <input id="tituloLegal" name="tituloLegal" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="direccion" className="text-sm font-medium text-slate-700">Direccion</label>
                    <input id="direccion" name="direccion" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ciudad" className="text-sm font-medium text-slate-700">Ciudad</label>
                    <input id="ciudad" name="ciudad" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="provincia" className="text-sm font-medium text-slate-700">Provincia</label>
                    <input id="provincia" name="provincia" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="codigoPostal" className="text-sm font-medium text-slate-700">Codigo postal</label>
                    <input id="codigoPostal" name="codigoPostal" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="cuit" className="text-sm font-medium text-slate-700">CUIT</label>
                    <input id="cuit" name="cuit" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-400 focus:ring-2" />
                  </div>
                </div>
              </section>

              <button type="submit" className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-800">
                Crear consorcio y continuar
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}

