import Link from "next/link";
import { redirect } from "next/navigation";

import { requireConsorcioRole } from "../../../../lib/auth";
import {
  DEFAULT_CUENTA_DNI_LABEL,
  QR_CUENTA_DNI_DINAMICO,
  normalizeQrPayloadTemplateInput,
  validateCuentaDniQrTemplate,
} from "../../../../lib/payment-qr";
import { prisma } from "../../../../../lib/prisma";

type CuentaBancariaQrFields = {
  qrEnabled?: boolean | null;
  qrMode?: string | null;
  qrPayloadTemplate?: string | null;
  qrLabel?: string | null;
  qrExperimental?: boolean | null;
};

function normalizeOptional(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function parseCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function normalizeCbu(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

function normalizeQrPayloadTemplate(formData: FormData, key: string) {
  const value = formData.get(key)?.toString() ?? "";
  const normalized = normalizeQrPayloadTemplateInput(value);
  return normalized ? normalized : null;
}

function normalizeQrMode(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim() ?? "";
  return value === QR_CUENTA_DNI_DINAMICO ? value : null;
}

function isValidCbu(value: string) {
  return /^\d{22}$/.test(value);
}

function getQrConfigFromForm(formData: FormData) {
  const qrEnabled = parseCheckbox(formData, "qrEnabled");
  const qrMode = normalizeQrMode(formData, "qrMode");
  const qrPayloadTemplate = normalizeQrPayloadTemplate(formData, "qrPayloadTemplate");
  const qrLabel = normalizeOptional(formData, "qrLabel");
  const qrExperimental = parseCheckbox(formData, "qrExperimental");

  if (!qrEnabled) {
    return {
      ok: true as const,
      data: {
        qrEnabled: false,
        qrMode: null,
        qrPayloadTemplate: null,
        qrLabel: null,
        qrExperimental: false,
      },
    };
  }

  if (qrMode !== QR_CUENTA_DNI_DINAMICO || !qrPayloadTemplate) {
    return { ok: false as const, reason: "invalid_qr_fields" };
  }

  try {
    validateCuentaDniQrTemplate(qrPayloadTemplate);
  } catch (error) {
    console.error("[qr-template] validateCuentaDniQrTemplate failed", {
      rawLength: formData.get("qrPayloadTemplate")?.toString().length ?? 0,
      normalizedLength: qrPayloadTemplate.length,
      normalizedPreview: qrPayloadTemplate.slice(0, 80),
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, reason: "invalid_qr_template" };
  }

  return {
    ok: true as const,
    data: {
      qrEnabled: true,
      qrMode,
      qrPayloadTemplate,
      qrLabel,
      qrExperimental,
    },
  };
}

function getCuentaMessage(code: string | undefined) {
  switch (code) {
    case "created":
      return { type: "ok" as const, text: "Cuenta bancaria creada correctamente." };
    case "updated":
      return { type: "ok" as const, text: "Cuenta bancaria actualizada correctamente." };
    case "deleted":
      return { type: "ok" as const, text: "Cuenta bancaria eliminada correctamente." };
    case "invalid_fields":
      return { type: "error" as const, text: "Banco, titular y CBU son obligatorios." };
    case "invalid_cbu":
      return { type: "error" as const, text: "El CBU debe tener 22 digitos numericos." };
    case "invalid_qr_fields":
      return { type: "error" as const, text: "Si el QR esta habilitado, modo y payload base son obligatorios." };
    case "invalid_qr_template":
      return { type: "error" as const, text: "El payload base QR no tiene un formato EMV valido." };
    case "invalid_id":
      return { type: "error" as const, text: "Cuenta bancaria invalida." };
    case "not_found":
      return { type: "error" as const, text: "No se encontro la cuenta bancaria." };
    default:
      return null;
  }
}

export default async function EditarConsorcioPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { cuentas?: string };
}) {
  const id = Number(params.id);
  await requireConsorcioRole(id, ["ADMIN"]);

  const consorcio = (await prisma.consorcio.findUnique({
    where: { id },
    include: {
      cuentasBancarias: {
        orderBy: [{ esCuentaExpensas: "desc" }, { activa: "desc" }, { banco: "asc" }, { id: "asc" }],
      },
    },
  })) as any;

  if (!consorcio) {
    return <div className="p-6">Consorcio no encontrado</div>;
  }

  const cuentaFeedback = getCuentaMessage(searchParams?.cuentas);

  async function updateConsorcio(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("id"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    const nombre = formData.get("nombre")?.toString() || "";
    const tituloLegal = normalizeOptional(formData, "tituloLegal");
    const direccion = formData.get("direccion")?.toString() || "";
    const ciudad = normalizeOptional(formData, "ciudad");
    const provincia = normalizeOptional(formData, "provincia");
    const codigoPostal = normalizeOptional(formData, "codigoPostal");
    const cuit = normalizeOptional(formData, "cuit");

    await prisma.consorcio.update({
      where: { id: consorcioId },
      data: {
        nombre,
        tituloLegal,
        direccion,
        ciudad,
        provincia,
        codigoPostal,
        cuit,
      },
    });

    redirect(`/consorcios/${consorcioId}`);
  }

  async function createCuentaBancaria(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    const banco = formData.get("banco")?.toString().trim() ?? "";
    const titular = formData.get("titular")?.toString().trim() ?? "";
    const cbu = normalizeCbu(formData.get("cbu")?.toString() ?? "");
    const alias = normalizeOptional(formData, "alias");
    const cuitTitular = normalizeOptional(formData, "cuitTitular");
    const activa = parseCheckbox(formData, "activa");
    const esCuentaExpensas = parseCheckbox(formData, "esCuentaExpensas");
    const activaFinal = esCuentaExpensas ? true : activa;
    const qrConfig = getQrConfigFromForm(formData);

    if (!banco || !titular || !cbu) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_fields`);
    }

    if (!isValidCbu(cbu)) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_cbu`);
    }

    if (!qrConfig.ok) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=${qrConfig.reason}`);
    }

    const cuentaData = {
      consorcioId,
      banco,
      titular,
      cbu,
      alias,
      cuitTitular,
      activa: activaFinal,
      esCuentaExpensas,
      ...(qrConfig.data as any),
    } as any;

    if (esCuentaExpensas) {
      await prisma.$transaction(async (tx) => {
        await tx.consorcioCuentaBancaria.updateMany({
          where: { consorcioId, esCuentaExpensas: true },
          data: { esCuentaExpensas: false },
        });

        await tx.consorcioCuentaBancaria.create({
          data: {
            ...cuentaData,
            esCuentaExpensas: true,
          },
        });
      });
    } else {
      await prisma.consorcioCuentaBancaria.create({ data: cuentaData });
    }

    redirect(`/consorcios/${consorcioId}/editar?cuentas=created`);
  }

  async function updateCuentaBancaria(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const cuentaId = Number(formData.get("cuentaId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_id`);
    }

    const banco = formData.get("banco")?.toString().trim() ?? "";
    const titular = formData.get("titular")?.toString().trim() ?? "";
    const cbu = normalizeCbu(formData.get("cbu")?.toString() ?? "");
    const alias = normalizeOptional(formData, "alias");
    const cuitTitular = normalizeOptional(formData, "cuitTitular");
    const activa = parseCheckbox(formData, "activa");
    const esCuentaExpensas = parseCheckbox(formData, "esCuentaExpensas");
    const activaFinal = esCuentaExpensas ? true : activa;
    const qrConfig = getQrConfigFromForm(formData);

    if (!banco || !titular || !cbu) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_fields`);
    }

    if (!isValidCbu(cbu)) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_cbu`);
    }

    if (!qrConfig.ok) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=${qrConfig.reason}`);
    }

    const existing = await prisma.consorcioCuentaBancaria.findFirst({
      where: { id: cuentaId, consorcioId },
      select: { id: true },
    });

    if (!existing) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=not_found`);
    }

    const cuentaData = {
      banco,
      titular,
      cbu,
      alias,
      cuitTitular,
      activa: activaFinal,
      esCuentaExpensas,
      ...(qrConfig.data as any),
    } as any;

    if (esCuentaExpensas) {
      await prisma.$transaction(async (tx) => {
        await tx.consorcioCuentaBancaria.updateMany({
          where: { consorcioId, esCuentaExpensas: true, id: { not: cuentaId } },
          data: { esCuentaExpensas: false },
        });

        await tx.consorcioCuentaBancaria.update({
          where: { id: cuentaId },
          data: {
            ...cuentaData,
            esCuentaExpensas: true,
          },
        });
      });
    } else {
      await prisma.consorcioCuentaBancaria.update({
        where: { id: cuentaId },
        data: cuentaData,
      });
    }

    redirect(`/consorcios/${consorcioId}/editar?cuentas=updated`);
  }

  async function deleteCuentaBancaria(formData: FormData) {
    "use server";

    const consorcioId = Number(formData.get("consorcioId"));
    const cuentaId = Number(formData.get("cuentaId"));
    await requireConsorcioRole(consorcioId, ["ADMIN"]);

    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=invalid_id`);
    }

    const existing = await prisma.consorcioCuentaBancaria.findFirst({
      where: { id: cuentaId, consorcioId },
      select: { id: true },
    });

    if (!existing) {
      redirect(`/consorcios/${consorcioId}/editar?cuentas=not_found`);
    }

    await prisma.consorcioCuentaBancaria.delete({ where: { id: cuentaId } });

    redirect(`/consorcios/${consorcioId}/editar?cuentas=deleted`);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-2">
        <Link href={`/consorcios/${consorcio.id}`} className="text-blue-600 hover:underline">
          Volver
        </Link>
        <h1 className="text-2xl font-semibold">Editar consorcio</h1>
      </header>

      <div className="space-y-6">
        <form
          action={updateConsorcio}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        >
          <input type="hidden" name="id" value={consorcio.id} />

          <div className="space-y-1">
            <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              required
              defaultValue={consorcio.nombre}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tituloLegal" className="text-sm font-medium text-slate-700">
              Titulo legal
            </label>
            <input
              id="tituloLegal"
              name="tituloLegal"
              type="text"
              defaultValue={consorcio.tituloLegal ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="direccion" className="text-sm font-medium text-slate-700">
              Direccion
            </label>
            <input
              id="direccion"
              name="direccion"
              required
              defaultValue={consorcio.direccion}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="ciudad" className="text-sm font-medium text-slate-700">
                Ciudad
              </label>
              <input
                id="ciudad"
                name="ciudad"
                defaultValue={consorcio.ciudad ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="provincia" className="text-sm font-medium text-slate-700">
                Provincia
              </label>
              <input
                id="provincia"
                name="provincia"
                defaultValue={consorcio.provincia ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="codigoPostal" className="text-sm font-medium text-slate-700">
                Codigo postal
              </label>
              <input
                id="codigoPostal"
                name="codigoPostal"
                defaultValue={consorcio.codigoPostal ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="cuit" className="text-sm font-medium text-slate-700">
                CUIT
              </label>
              <input
                id="cuit"
                name="cuit"
                defaultValue={consorcio.cuit ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Guardar datos del consorcio
          </button>
        </form>

        <details open className="rounded-lg border border-slate-200 bg-white p-6">
          <summary className="cursor-pointer text-base font-semibold text-slate-900">CUENTAS BANCARIAS</summary>

          <div className="mt-4 space-y-4">
            {cuentaFeedback ? (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  cuentaFeedback.type === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {cuentaFeedback.text}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Banco</th>
                    <th className="px-3 py-2 font-medium">Titular</th>
                    <th className="px-3 py-2 font-medium">CBU</th>
                    <th className="px-3 py-2 font-medium">Alias</th>
                    <th className="px-3 py-2 font-medium">Cuenta de expensas</th>
                    <th className="px-3 py-2 font-medium">QR</th>
                    <th className="px-3 py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consorcio.cuentasBancarias.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={7}>
                        No hay cuentas bancarias cargadas.
                      </td>
                    </tr>
                  ) : (
                    (consorcio.cuentasBancarias as Array<(typeof consorcio.cuentasBancarias)[number] & CuentaBancariaQrFields>).map((cuenta) => {
                      const formId = `update-cuenta-${cuenta.id}`;

                      return (
                        <tr key={cuenta.id} className="align-top">
                          <td className="px-3 py-3">
                            <input
                              name="banco"
                              form={formId}
                              defaultValue={cuenta.banco}
                              required
                              className="w-44 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              name="titular"
                              form={formId}
                              defaultValue={cuenta.titular}
                              required
                              className="w-44 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              name="cbu"
                              form={formId}
                              defaultValue={cuenta.cbu}
                              required
                              pattern="[0-9]{22}"
                              title="22 digitos"
                              className="w-52 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              name="alias"
                              form={formId}
                              defaultValue={cuenta.alias ?? ""}
                              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <input
                              name="cuitTitular"
                              form={formId}
                              defaultValue={cuenta.cuitTitular ?? ""}
                              placeholder="CUIT titular"
                              className="mt-2 w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <label className="flex items-center gap-2 text-xs text-slate-700">
                              <input form={formId} type="checkbox" name="esCuentaExpensas" defaultChecked={cuenta.esCuentaExpensas} />
                              Expensas
                            </label>
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                              <input form={formId} type="checkbox" name="activa" defaultChecked={cuenta.activa} />
                              Activa
                            </label>
                          </td>
                          <td className="px-3 py-3">
                            <div className="w-64 space-y-2">
                              <label className="flex items-center gap-2 text-xs text-slate-700">
                                <input form={formId} type="checkbox" name="qrEnabled" defaultChecked={Boolean(cuenta.qrEnabled)} />
                                QR habilitado
                              </label>
                              <select
                                name="qrMode"
                                form={formId}
                                defaultValue={cuenta.qrMode ?? ""}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              >
                                <option value="">Sin QR</option>
                                <option value={QR_CUENTA_DNI_DINAMICO}>Cuenta DNI dinamico</option>
                              </select>
                              <input
                                name="qrLabel"
                                form={formId}
                                defaultValue={cuenta.qrLabel ?? DEFAULT_CUENTA_DNI_LABEL}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                              <textarea
                                name="qrPayloadTemplate"
                                form={formId}
                                defaultValue={cuenta.qrPayloadTemplate ?? ""}
                                rows={5}
                                className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-[11px]"
                              />
                              <label className="flex items-center gap-2 text-xs text-slate-700">
                                <input form={formId} type="checkbox" name="qrExperimental" defaultChecked={Boolean(cuenta.qrExperimental)} />
                                Experimental
                              </label>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <form id={formId} action={updateCuentaBancaria}>
                                <input type="hidden" name="consorcioId" value={consorcio.id} />
                                <input type="hidden" name="cuentaId" value={cuenta.id} />
                                <button
                                  type="submit"
                                  className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                                >
                                  Guardar
                                </button>
                              </form>
                              <form action={deleteCuentaBancaria}>
                                <input type="hidden" name="consorcioId" value={consorcio.id} />
                                <input type="hidden" name="cuentaId" value={cuenta.id} />
                                <button
                                  type="submit"
                                  className="rounded border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Eliminar
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Nueva cuenta bancaria</h2>
              <form action={createCuentaBancaria} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="consorcioId" value={consorcio.id} />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Banco</label>
                  <input name="banco" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Titular</label>
                  <input name="titular" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">CBU</label>
                  <input
                    name="cbu"
                    required
                    pattern="[0-9]{22}"
                    title="Debe tener 22 digitos numericos"
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Alias</label>
                  <input name="alias" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">CUIT titular (opcional)</label>
                  <input name="cuitTitular" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Opciones</label>
                  <div className="space-y-1 rounded border border-slate-200 bg-white p-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="activa" defaultChecked />
                      Activa
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="esCuentaExpensas" />
                      Usar esta cuenta para cobrar expensas
                    </label>
                  </div>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium text-slate-700">Configuracion QR</label>
                  <div className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="qrEnabled" />
                        Habilitar QR en boletas
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="qrExperimental" />
                        Marcar como experimental
                      </label>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Modo QR</label>
                      <select name="qrMode" defaultValue="" className="w-full rounded border border-slate-300 px-3 py-2 text-sm">
                        <option value="">Sin QR</option>
                        <option value={QR_CUENTA_DNI_DINAMICO}>Cuenta DNI dinamico</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Texto debajo del QR</label>
                      <input
                        name="qrLabel"
                        defaultValue={DEFAULT_CUENTA_DNI_LABEL}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-medium text-slate-700">Payload base EMV</label>
                      <textarea
                        name="qrPayloadTemplate"
                        rows={6}
                        className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                        placeholder="Pega aca el payload base de Cuenta DNI"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Agregar cuenta bancaria
                  </button>
                </div>
              </form>
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}






