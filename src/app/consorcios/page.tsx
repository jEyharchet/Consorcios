export default function ConsorciosPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Consorcios</h1>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Nuevo consorcio
        </button>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Dirección</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Unidades</th>
            </tr>
          </thead>
          <tbody />
        </table>
      </div>
    </main>
  );
}
