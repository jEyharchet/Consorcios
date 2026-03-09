import { redirect } from "next/navigation";

import { auth, signIn } from "../../../auth";

type LoginPageProps = {
  searchParams?: { error?: string };
};

const errorMessages: Record<string, string> = {
  AccessDenied: "Tu usuario esta desactivado o no tiene acceso.",
  Configuration: "Falta configurar Google OAuth en variables de entorno.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  const error = searchParams?.error;
  const errorMessage = error ? errorMessages[error] ?? "No fue posible iniciar sesion." : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Iniciar sesion</h1>
        <p className="mt-2 text-sm text-slate-600">Accede al sistema con tu cuenta de Google.</p>

        {errorMessage ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ingresar con Google
          </button>
        </form>
      </section>
    </main>
  );
}
