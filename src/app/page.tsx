import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="flex w-full max-w-3xl flex-col items-center text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Administración de Consorcios
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          Sistema para gestión de edificios, unidades y expensas
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/consorcios"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Consorcios
          </Link>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Unidades
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Expensas
          </button>
        </div>
      </section>
    </main>
  );
}
