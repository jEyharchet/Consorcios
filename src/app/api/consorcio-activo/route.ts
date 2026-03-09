import { NextResponse } from "next/server";

import { updateActiveConsorcio } from "../../../lib/consorcio-activo";

export async function POST(request: Request) {
  let consorcioId: number | null = null;

  try {
    const body = await request.json();
    const parsed = Number(body?.consorcioId);
    consorcioId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    consorcioId = null;
  }

  const activeConsorcioId = await updateActiveConsorcio(consorcioId);

  return NextResponse.json({ ok: true, activeConsorcioId });
}
