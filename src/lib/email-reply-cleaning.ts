function normalizeComparableLine(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReplyBoundary(line: string, nextLine?: string) {
  const current = normalizeComparableLine(line);
  const combined = normalizeComparableLine(nextLine ? `${line} ${nextLine}` : line);

  if (!current) {
    return false;
  }

  return [
    /^On .+ wrote:\s*$/i,
    /^El .+ escribio:\s*$/i,
    /^-+\s*Original Message\s*-+\s*$/i,
    /^De:\s.+$/i,
  ].some((pattern) => pattern.test(current) || pattern.test(combined));
}

export function extractLatestReplyText(value: string | null | undefined) {
  const raw = value?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() ?? "";

  if (!raw) {
    return "";
  }

  const lines = raw.split("\n");
  const keptLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    if (isReplyBoundary(line, nextLine)) {
      break;
    }

    if (line.trim().startsWith(">")) {
      continue;
    }

    keptLines.push(line);
  }

  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
