const REPLY_CUT_PATTERNS = [
  /^\s*On .+ wrote:\s*$/i,
  /^\s*El .+ escribi[oó]:\s*$/i,
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
    if (REPLY_CUT_PATTERNS.some((pattern) => pattern.test(line))) {
      break;
    }

    if (line.trim().startsWith(">")) {
      continue;
    }

    keptLines.push(line);
  }

  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
