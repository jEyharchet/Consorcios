export function normalizePeriodo(value: string): string | null {
  const raw = value.trim();

  if (!raw) {
    return null;
  }

  const canonical = raw.match(/^(\d{4})-(\d{2})$/);
  if (canonical) {
    const month = Number(canonical[2]);
    if (month >= 1 && month <= 12) {
      return `${canonical[1]}-${canonical[2]}`;
    }

    return null;
  }

  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) {
    const month = Number(compact[2]);
    if (month >= 1 && month <= 12) {
      return `${compact[1]}-${compact[2]}`;
    }
  }

  return null;
}

export function getPeriodoVariants(periodo: string): string[] {
  const normalized = normalizePeriodo(periodo);

  if (!normalized) {
    return [];
  }

  const compact = normalized.replace("-", "");
  return [normalized, compact];
}

export function getCurrentPeriodo(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}
