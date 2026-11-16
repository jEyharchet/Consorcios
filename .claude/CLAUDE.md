# Forma de trabajo con Claude en este proyecto

- Responder en español.
- Antes de cambiar lógica de liquidaciones, cobranzas o tesorería, leer el flujo completo en `src/lib/` y explicar el impacto en saldos ya registrados.
- No ejecutar scripts que escriban en la base (`reset:liquidaciones`, `migrate:*`, `test-*-write.ts`) sin confirmación explícita.
- No hacer deploy a producción, cambiar configuración de Vercel/Neon ni variables de entorno sin confirmación explícita.
- Commits: solo cuando se pidan; nunca incluir `prisma/migrations/**` modificadas por cambios de line endings.
- Al terminar una tarea relevante, actualizar el "Historial de decisiones" de abajo con fecha absoluta.

## Historial de decisiones

- 2026-11-16: Fase 1 y 2 del plan de inconsistencias: repo limpio de Supabase, `vercel.json` fija `gru1`, branch Neon `dev` (`ep-empty-truth`) para local/Preview/Development, y 6 secuencias desfasadas corregidas con `setval` en producción y `dev`. `DATABASE_URL` de Production reescrita con la URL pooler conocida (era Secret, ilegible). Deploy de producción verificado (expensas y PDF de liquidación OK).
- 2026-11-16: Las funciones de Vercel pasaron de `iad1` a `gru1` para quedar en la misma región que la base Neon (`sa-east-1`). La lentitud venía de la consulta cruzada EE.UU.–São Paulo tras volver de Supabase a Neon.
- 2026-11-16: Se descartó Supabase; la base de producción sigue en Neon. Los cambios locales del README, `.env.example` y `scripts/migrate-neon-to-supabase.ts` que hablan de Supabase quedan obsoletos.
- 2026-11-02: Diseño de cierre anual documentado en `docs/cierre-anual.md` (primer ejercicio 01/10/2025–30/09/2026, apertura en cero; rendición vence 29/11/2026). Primero simulación, después confirmación.

## Plan en curso

Ninguno. El plan de inconsistencias Neon/Supabase se cerró el 2026-11-16 (`.claude/plan-inconsistencias.md`, solo como registro).

## Pendientes conocidos

- Implementar la simulación del cierre anual.
- Evaluar `cache()` de React para deduplicar `auth()` / `getAccessContext()` en el layout.
- Evaluar mover PDFs de liquidación de `/tmp` a almacenamiento persistente.
- Migrar montos de `Float` a `Decimal` antes del cierre anual.
- Eliminar `better-sqlite3` y `scripts/migrate-sqlite-to-postgres.ts` (migración SQLite terminada).
- Aislar Resend en Preview/Development: el branch Neon `dev` es copia de producción con emails reales de propietarios.
- Quitar `BETTER_AUTH_SECRET` de Vercel (3 entornos): no se usa. Vercel además marca como "Needs Attention" `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `RESEND_API_KEY` y `MAILGUN_SIGNING_KEY` por estar como Config: pasarlas a Secret.
- Reescribir `scripts/backup-db.ps1` (copia un `dev.db` de SQLite; no respalda Neon) con `pg_dump` sobre `PROD_DATABASE_URL`.
