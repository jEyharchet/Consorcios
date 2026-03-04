import Link from "next/link";

export default function NuevoConsorcioPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nuevo consorcio</h1>

      <form className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="direccion" className="block text-sm font-medium text-slate-700">
            Dirección
          </label>
          <input
            id="direccion"
            name="direccion"
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Guardar
          </button>
          <Link
            href="/consorcios"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
