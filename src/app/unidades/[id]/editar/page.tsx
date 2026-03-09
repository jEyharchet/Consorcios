import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "../../../../../lib/prisma";
import { requireConsorcioRole } from "../../../../lib/auth";

export default async function EditarUnidadPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const unidad = await prisma.unidad.findUnique({ where: { id } });

  if (!unidad) {
    return <div className="p-6">Unidad no encontrada</div>;
  }

  await requireConsorcioRole(unidad.consorcioId, ["ADMIN", "OPERADOR"]);

  async function updateUnidad(formData: FormData) {
    "use server";

    const id = Number(formData.get("id"));
    const unidadActual = await prisma.unidad.findUnique({ where: { id }, select: { consorcioId: true } });

    if (!unidadActual) {
      redirect("/consorcios");
    }

    await requireConsorcioRole(unidadActual.consorcioId, ["ADMIN", "OPERADOR"]);

    const identificador = (formData.get("identificador")?.toString() ?? "").trim();
    const tipo = (formData.get("tipo")?.toString() ?? "").trim();
    const pisoRaw = (formData.get("piso")?.toString() ?? "").trim();
    const departamentoRaw = (formData.get("departamento")?.toString() ?? "").trim();
    const superficieRaw = (formData.get("superficie")?.toString() ?? "").trim();
    const porcentajeRaw = (formData.get("porcentajeExpensas")?.toString() ?? "").trim();

    const piso = pisoRaw === "" ? null : pisoRaw;
    const departamento = departamentoRaw === "" ? null : departamentoRaw;
    const superficie = superficieRaw === "" ? null : Number(superficieRaw);
    const porcentajeExpensas = porcentajeRaw === "" ? null : Number(porcentajeRaw);

    await prisma.unidad.update({
      where: { id },
      data: { identificador, tipo, piso, departamento, superficie, porcentajeExpensas },
    });

    redirect(`/unidades/${id}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/unidades/${unidad.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Editar unidad</h1>
      </header>

      <form action={updateUnidad} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="id" value={unidad.id} />

        <div className="space-y-1">
          <label htmlFor="identificador" className="text-sm font-medium text-slate-700">
            Identificador
          </label>
          <input
            id="identificador"
            name="identificador"
            required
            defaultValue={unidad.identificador}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="tipo" className="text-sm font-medium text-slate-700">
            Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            required
            defaultValue={unidad.tipo}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          >
            <option value="DEPARTAMENTO">DEPARTAMENTO</option>
            <option value="LOCAL">LOCAL</option>
            <option value="COCHERA">COCHERA</option>
            <option value="BAULERA">BAULERA</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="piso" className="text-sm font-medium text-slate-700">
            Piso
          </label>
          <input
            id="piso"
            name="piso"
            defaultValue={unidad.piso ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="departamento" className="text-sm font-medium text-slate-700">
            Departamento
          </label>
          <input
            id="departamento"
            name="departamento"
            defaultValue={unidad.departamento ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="superficie" className="text-sm font-medium text-slate-700">
            Superficie
          </label>
          <input
            id="superficie"
            name="superficie"
            type="number"
            step="any"
            defaultValue={unidad.superficie ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="porcentajeExpensas" className="text-sm font-medium text-slate-700">
            Porcentaje expensas
          </label>
          <input
            id="porcentajeExpensas"
            name="porcentajeExpensas"
            type="number"
            step="any"
            defaultValue={unidad.porcentajeExpensas ?? ""}
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
