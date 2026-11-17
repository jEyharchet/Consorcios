# Forma de trabajo con Claude en este proyecto

- Responder en español.
- Antes de cambiar lógica de liquidaciones, cobranzas o tesorería, leer el flujo completo en `src/lib/` y explicar el impacto en saldos ya registrados.
- No ejecutar scripts que escriban en la base (`reset:liquidaciones`, `migrate:*`, `test-*-write.ts`) sin confirmación explícita.
- No hacer deploy a producción, cambiar configuración de Vercel/Neon ni variables de entorno sin confirmación explícita.
- Commits: solo cuando se pidan; nunca incluir `prisma/migrations/**` modificadas por cambios de line endings.
- Al terminar una tarea relevante, actualizar el "Historial de decisiones" de abajo con fecha absoluta.

## Historial de decisiones

- 2026-11-17: Rendición de cuentas en PDF generada al momento desde la simulación (`/api/ejercicios/[id]/rendicion`). Comprobantes del ejercicio 1 de Jara 166 completos en producción (#30 y #31 comparten la factura de 610.000 de la escribana).
- 2026-11-17: Traslado de deuda: la expensa original pasa a `TRASLADADA` (saldo descontado) al finalizar la liquidación que la incluye; el cálculo de deuda y el estado de cuenta de PDFs lo contemplan (`src/lib/expensa-traslado.ts`). Gasto con `comprobanteFaltanteMotivo` y bloque de comprobante en la edición (aunque esté pagado). Límite de comprobantes 4 MB + `serverActions.bodySizeLimit` 4.5mb. Migraciones `20261117090000` (traslados), `20261117100000` (motivo) y `20261117110000` (transferencia Jara 166 del 10/04 a 48.000; saldo banco −0,01) aplicadas en `dev` y producción; deploy `65ea2c7` Ready. Motivos de falta de comprobante cargados en producción: 17 gastos de Galimberti, 9 de luz y el #20.
- 2026-11-16: Simulación del cierre (solo lectura) en `src/lib/cierre-simulacion.ts` y `/administracion/ejercicios/[id]/simulacion`; criterios en `docs/cierre-anual.md`. Hallazgo: trasladar deuda (`LiquidacionDeuda`) no cierra la expensa original, que queda contada dos veces fuera de la simulación. `formatDateTime` de `administracion/shared.ts` ahora fija hora de Argentina (deploy `c2495e4`).
- 2026-11-16: Ejercicio económico configurable por consorcio: modelo `Ejercicio` con fechas explícitas (`DATE`, inclusive), estado, fundamento, estado de apertura y vencimiento de rendición (fin + 60 días). Migración `20261116120000_ejercicio_consorcio` aplicada en el branch Neon `dev` y en producción (deploy `c1a6e91` verificado Ready). Reglas en `src/lib/ejercicios.ts` (prueba: `scripts/test-ejercicios.ts`). `docs/cierre-anual.md` pasó a ser el diseño general; lo propio de Jara 166 quedó en `docs/cierre-anual-jara-166.md`. Pantalla en Administración → Ejercicios (`/administracion/ejercicios` y `/[id]`), con entrada en el menú lateral; escritura solo para `ADMIN`, lógica en `src/lib/ejercicios-data.ts` (transacciones serializables).
- 2026-11-16: Fase 1 y 2 del plan de inconsistencias: repo limpio de Supabase, `vercel.json` fija `gru1`, branch Neon `dev` (`ep-empty-truth`) para local/Preview/Development, y 6 secuencias desfasadas corregidas con `setval` en producción y `dev`. `DATABASE_URL` de Production reescrita con la URL pooler conocida (era Secret, ilegible). Deploy de producción verificado (expensas y PDF de liquidación OK).
- 2026-11-16: Las funciones de Vercel pasaron de `iad1` a `gru1` para quedar en la misma región que la base Neon (`sa-east-1`). La lentitud venía de la consulta cruzada EE.UU.–São Paulo tras volver de Supabase a Neon.
- 2026-11-16: Se descartó Supabase; la base de producción sigue en Neon. Los cambios locales del README, `.env.example` y `scripts/migrate-neon-to-supabase.ts` que hablan de Supabase quedan obsoletos.
- 2026-11-02: Diseño de cierre anual documentado en `docs/cierre-anual.md` (primer ejercicio 01/10/2025–30/09/2026, apertura en cero; rendición vence 29/11/2026). Primero simulación, después confirmación.

## Plan en curso

Ninguno. El plan de inconsistencias Neon/Supabase se cerró el 2026-11-16 (`.claude/plan-inconsistencias.md`, solo como registro).

## Pendientes conocidos

- Cierre anual (rendición vence 29/11/2026): revisar la rendición PDF en producción; regenerar PDFs de UF 01 desde 2026-04 si se reenvían; luego confirmación del cierre, notas libres en la rendición, anexo de comprobantes, detalle de apertura por cuenta y fondo de reserva.
- La edición de gastos se bloquea con liquidaciones `EMITIDA`/`CERRADA`, pero las liquidaciones quedan `FINALIZADA`: el bloqueo nunca aplica. Decidir si incluir `FINALIZADA` (el comprobante ya es editable aparte).
- Traslado PARCIAL o solo de INTERES: el capital que queda en la expensa original no vuelve a ofrecerse en el paso 2.
- Drift preexistente en `dev`: `PagoGasto.updatedAt` y `RespuestaEmail.updatedAt` tienen `DEFAULT` en la base que el esquema no declara. Inofensivo; resolver con una migración nueva si se quiere alinear.
- Evaluar `cache()` de React para deduplicar `auth()` / `getAccessContext()` en el layout.
- Evaluar mover PDFs de liquidación de `/tmp` a almacenamiento persistente.
- Migrar montos de `Float` a `Decimal` antes del cierre anual.
- Eliminar `better-sqlite3` y `scripts/migrate-sqlite-to-postgres.ts` (migración SQLite terminada).
- Aislar Resend en Preview/Development: el branch Neon `dev` es copia de producción con emails reales de propietarios.
- Quitar `BETTER_AUTH_SECRET` de Vercel (3 entornos): no se usa. Vercel además marca como "Needs Attention" `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY` y `MAILGUN_SIGNING_KEY` por estar como Config: pasarlas a Secret.
- Reescribir `scripts/backup-db.ps1` (copia un `dev.db` de SQLite; no respalda Neon) con `pg_dump` sobre `PROD_DATABASE_URL`.
