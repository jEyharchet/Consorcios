import { isVigente, normalizeDate } from "./relaciones";

type AdministradorRelacionBase = {
  id: number;
  desde: Date;
  hasta: Date | null;
};

export function getAdministradorVigente<T extends AdministradorRelacionBase>(
  relaciones: T[],
  refDate = new Date(),
): T | null {
  if (relaciones.length === 0) {
    return null;
  }

  const reference = normalizeDate(refDate);
  const vigentes = relaciones.filter((rel) => isVigente(rel.desde, rel.hasta, reference));

  if (vigentes.length === 0) {
    return null;
  }

  return vigentes.sort((a, b) => {
    const desdeDiff = b.desde.getTime() - a.desde.getTime();
    if (desdeDiff !== 0) {
      return desdeDiff;
    }

    return b.id - a.id;
  })[0];
}
