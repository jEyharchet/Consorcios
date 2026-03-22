import Link from "next/link";
import { redirect } from "next/navigation";

import { findPersonaByEmail, normalizeEmailIdentity } from "../../../lib/persona-identity";
import { prisma } from "../../../lib/prisma";

export default function NuevaPersonaPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  async function crearPersona(formData: FormData) {
    "use server";

    const nombre = (formData.get("nombre")?.toString() ?? "").trim();
    const apellido = (formData.get("apellido")?.toString() ?? "").trim();
    const emailRaw = (formData.get("email")?.toString() ?? "").trim();
    const telefonoRaw = (formData.get("telefono")?.toString() ?? "").trim();
    const email = normalizeEmailIdentity(emailRaw);

    if (!nombre || !apellido) {
      redirect("/personas/nueva");
    }

    if (email) {
      const existingPersona = await findPersonaByEmail(email, prisma);

      if (existingPersona) {
        redirect("/personas/nueva?error=email_duplicado");
      }
    }

    await prisma.persona.create({
      data: {
        nombre,
        apellido,
        email,
        telefono: telefonoRaw || null,
      },
    });

    redirect("/personas");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href="/personas" className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Nueva persona</h1>
      </header>

      {searchParams?.error === "email_duplicado" ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Ya existe una persona con ese email.
        </div>
      ) : null}

      <form action={crearPersona} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="apellido" className="text-sm font-medium text-slate-700">
            Apellido
          </label>
          <input
            id="apellido"
            name="apellido"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-slate-700">
            Telefono
          </label>
          <input
            id="telefono"
            name="telefono"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Guardar
        </button>
      </form>
    </main>
  );
}
