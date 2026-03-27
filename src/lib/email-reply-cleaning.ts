function normalizeComparableLine(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const REPLY_CUT_PATTERNS = [
  /^\s*On .+ wrote:\s*$/i,
  /^\s*El .+ escribio:\s*$/i,
  /^\s*-----Original Message-----\s*$/i,
  /^\s*De:\s.+$/i,
];

export function extractLatestReplyText(value: string | null | undefined) {
  const raw = value?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() ?? "";

  if (!raw) {
    return "";
  }

  const keptLines: string[] = [];

  for (const line of raw.split("\n")) {
    const comparableLine = normalizeComparableLine(line);

    if (REPLY_CUT_PATTERNS.some((pattern) => pattern.test(comparableLine))) {
      break;
    }

    if (line.trim().startsWith(">")) {
      continue;
    }

    keptLines.push(line);
  }

  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
