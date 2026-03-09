import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { CONSORCIO_ROLES, isConsorcioRole } from "../../lib/roles";

function getMessage(error?: string, ok?: string) {
  if (error === "missing_fields") return { type: "error", text: "Completa usuario, consorcio y rol." };
  if (error === "invalid_role") return { type: "error", text: "El rol seleccionado no es valido." };
  if (error === "invalid_assignment") return { type: "error", text: "La asignacion indicada no es valida." };
  if (error === "duplicate_assignment") return { type: "error", text: "Ese usuario ya tiene asignado ese consorcio." };
  if (error === "not_found") return { type: "error", text: "No se encontro el usuario o el consorcio." };
  if (error === "super_admin_assignment") {
    return { type: "error", text: "No se pueden gestionar consorcios para un SUPER_ADMIN." };
  }

  if (ok === "assigned") return { type: "ok", text: "Consorcio asignado correctamente." };
  if (ok === "role_updated") return { type: "ok", text: "Rol actualizado correctamente." };
  if (ok === "assignment_removed") return { type: "ok", text: "Asignacion eliminada correctamente." };

  return null;
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  await requireSuperAdmin();

  async function assignConsorcioToUser(formData: FormData) {
    "use server";

    await requireSuperAdmin();

    const userId = formData.get("userId")?.toString() ?? "";
    const consorcioId = Number(formData.get("consorcioId"));
    const roleInput = formData.get("role")?.toString() ?? "";

    if (!userId || !Number.isInteger(consorcioId) || consorcioId <= 0 || !isConsorcioRole(roleInput)) {
      redirect(`/usuarios?error=${isConsorcioRole(roleInput) ? "missing_fields" : "invalid_role"}`);
    }

    const [user, consorcioExists] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
      prisma.consorcio.count({ where: { id: consorcioId } }),
    ]);

    if (!user || !consorcioExists) {
      redirect("/usuarios?error=not_found");
    }

    if (user.role === "SUPER_ADMIN") {
      redirect("/usuarios?error=super_admin_assignment");
    }

    try {
      await prisma.userConsorcio.create({
        data: {
          userId,
          consorcioId,
          role: roleInput,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect("/usuarios?error=duplicate_assignment");
      }

      throw error;
    }

    redirect("/usuarios?ok=assigned");
  }

  async function updateUserConsorcioRole(formData: FormData) {
    "use server";

    await requireSuperAdmin();

    const assignmentId = Number(formData.get("assignmentId"));
    const roleInput = formData.get("role")?.toString() ?? "";

    if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !isConsorcioRole(roleInput)) {
      redirect(`/usuarios?error=${isConsorcioRole(roleInput) ? "invalid_assignment" : "invalid_role"}`);
    }

    await prisma.userConsorcio.update({
      where: { id: assignmentId },
      data: { role: roleInput },
    });

    redirect("/usuarios?ok=role_updated");
  }

  async function removeUserConsorcio(formData: FormData) {
    "use server";

    await requireSuperAdmin();

    const assignmentId = Number(formData.get("assignmentId"));

    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      redirect("/usuarios?error=invalid_assignment");
    }

    await prisma.userConsorcio.delete({
      where: { id: assignmentId },
    });

    redirect("/usuarios?ok=assignment_removed");
  }

  const [usuarios, consorcios] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        activo: true,
        createdAt: true,
        userConsorcios: {
          include: {
            consorcio: {
              select: { id: true, nombre: true },
            },
          },
          orderBy: { consorcio: { nombre: "asc" } },
        },
      },
    }),
    prisma.consorcio.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  const message = getMessage(searchParams?.error, searchParams?.ok);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="mb-4">
        <Link href="/" className="text-blue-600 hover:underline">
          Volver
        </Link>
      </div>

      <h1 className="text-3xl font-bold">Usuarios</h1>

      {message ? (
        <div
          className={`mt-4 rounded-md px-4 py-3 text-sm ${
            message.type === "error" ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Nombre</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Role global</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Activo</th>
                <th className="px-4 py-3 font-semibold text-slate-700">CreatedAt</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Consorcios asignados</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Asignar consorcio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-slate-500">
                    No hay usuarios cargados.
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => {
                  const isSuperAdmin = usuario.role === "SUPER_ADMIN";

                  return (
                    <tr key={usuario.id} className={usuario.activo ? "align-top" : "align-top bg-gray-50 text-gray-500"}>
                      <td className="px-4 py-3">{usuario.name ?? "-"}</td>
                      <td className="px-4 py-3">{usuario.email ?? "-"}</td>
                      <td className="px-4 py-3">{usuario.role}</td>
                      <td className="px-4 py-3">{usuario.activo ? "Si" : "No"}</td>
                      <td className="px-4 py-3">{usuario.createdAt.toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {isSuperAdmin ? (
                          <p className="font-medium text-slate-700">Acceso total</p>
                        ) : usuario.userConsorcios.length === 0 ? (
                          <p className="text-slate-500">Sin asignaciones</p>
                        ) : (
                          <div className="space-y-2">
                            {usuario.userConsorcios.map((assignment) => (
                              <div key={assignment.id} className="rounded-md border border-slate-200 p-2">
                                <p className="text-slate-800">{assignment.consorcio.nombre}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <form action={updateUserConsorcioRole} className="flex items-center gap-2">
                                    <input type="hidden" name="assignmentId" value={assignment.id} />
                                    <select
                                      name="role"
                                      defaultValue={assignment.role}
                                      className="rounded-md border border-slate-300 px-2 py-1"
                                    >
                                      {CONSORCIO_ROLES.map((role) => (
                                        <option key={role} value={role}>
                                          {role}
                                        </option>
                                      ))}
                                    </select>
                                    <button type="submit" className="text-blue-600 hover:underline">
                                      Guardar rol
                                    </button>
                                  </form>

                                  <form action={removeUserConsorcio}>
                                    <input type="hidden" name="assignmentId" value={assignment.id} />
                                    <button type="submit" className="text-red-600 hover:underline">
                                      Quitar
                                    </button>
                                  </form>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isSuperAdmin ? (
                          <span className="text-slate-500">No aplica</span>
                        ) : (
                          <form action={assignConsorcioToUser} className="space-y-2">
                            <input type="hidden" name="userId" value={usuario.id} />
                            <select name="consorcioId" defaultValue="" className="w-full rounded-md border border-slate-300 px-2 py-1">
                              <option value="" disabled>
                                Seleccionar consorcio
                              </option>
                              {consorcios.map((consorcio) => (
                                <option key={consorcio.id} value={consorcio.id}>
                                  {consorcio.nombre}
                                </option>
                              ))}
                            </select>

                            <select name="role" defaultValue="LECTURA" className="w-full rounded-md border border-slate-300 px-2 py-1">
                              {CONSORCIO_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>

                            <button
                              type="submit"
                              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              Asignar
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
