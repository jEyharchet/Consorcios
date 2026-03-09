export const GLOBAL_ROLES = ["SUPER_ADMIN", "USER"] as const;
export const CONSORCIO_ROLES = ["ADMIN", "OPERADOR", "LECTURA"] as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[number];
export type ConsorcioRole = (typeof CONSORCIO_ROLES)[number];

export function isGlobalRole(value: string): value is GlobalRole {
  return (GLOBAL_ROLES as readonly string[]).includes(value);
}

export function isConsorcioRole(value: string): value is ConsorcioRole {
  return (CONSORCIO_ROLES as readonly string[]).includes(value);
}
