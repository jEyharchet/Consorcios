# Forma de trabajo con Claude en este proyecto

- Responder en español.
- Antes de cambiar lógica de liquidaciones, cobranzas o tesorería, leer el flujo completo en `src/lib/` y explicar el impacto en saldos ya registrados.
- No ejecutar scripts que escriban en la base (`reset:liquidaciones`, `migrate:*`, `test-*-write.ts`) sin confirmación explícita.
- No hacer deploy a producción, cambiar configuración de Vercel/Neon ni variables de entorno sin confirmación explícita.
- Commits: solo cuando se pidan; nunca incluir `prisma/migrations/**` modificadas por cambios de line endings.
- Al terminar una tarea relevante, actualizar el "Historial de decisiones" de abajo con fecha absoluta.

## Historial de decisiones

- 2026-11-16: Las funciones de Vercel pasaron de `iad1` a `gru1` para quedar en la misma región que la base Neon (`sa-east-1`). La lentitud venía de la consulta cruzada EE.UU.–São Paulo tras volver de Supabase a Neon.
- 2026-11-16: Se descartó Supabase; la base de producción sigue en Neon. Los cambios locales del README, `.env.example` y `scripts/migrate-neon-to-supabase.ts` que hablan de Supabase quedan obsoletos.
- 2026-11-02: Diseño de cierre anual documentado en `docs/cierre-anual.md` (primer ejercicio 01/10/2025–30/09/2026, apertura en cero; rendición vence 29/11/2026). Primero simulación, después confirmación.

## Pendientes conocidos

- `DATABASE_URL` de Preview/Development en Vercel apunta a la base vieja `ep-icy-queen` (us-east-1) con credenciales inválidas.
- Revertir el CRLF agregado a migraciones aplicadas en el working tree.
- Implementar la simulación del cierre anual.
- Evaluar `cache()` de React para deduplicar `auth()` / `getAccessContext()` en el layout.
- Evaluar mover PDFs de liquidación de `/tmp` a almacenamiento persistente.
