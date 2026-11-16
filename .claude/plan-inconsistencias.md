# Plan: corregir inconsistencias tras la ida y vuelta Neon → Supabase → Neon

**Estado: CERRADO el 2026-11-16.** Todos los pasos completados. Los pendientes de "Fuera de alcance" pasaron a `.claude/CLAUDE.md`.

Creado: 2026-11-16. Estado de cada paso: `[ ]` pendiente, `[x]` hecho (anotar fecha).
Contexto: producción usa Neon `AMiConsorcio` (`sa-east-1`, endpoint `ep-old-bonus`); Supabase se descartó.
Las funciones de Vercel ya se movieron a `gru1` el 2026-11-16.

## Fase 1: Repo (local, sin riesgo, un commit por paso)

- [x] (2026-11-16) **1.1 Revertir el CRLF en migraciones aplicadas.**
  `git checkout -- prisma/migrations` (5 archivos con solo un `\r` final). Verificar con `git diff --stat prisma/migrations` vacío.
  Por qué: cambian el checksum y `prisma migrate deploy` falla con *checksum mismatch*.
- [x] (2026-11-16) **1.2 Volver la documentación a Neon.**
  Revertir `README.md` y `.env.example` (`git checkout --`) y actualizar la sección a "Prisma + Neon (sa-east-1)", con un ejemplo de URL `-pooler` + `sslmode=require`.
- [x] (2026-11-16) **1.3 Quitar rastros de Supabase.**
  Revertir `package.json` (script `migrate:neon-to-supabase`) y borrar `scripts/migrate-neon-to-supabase.ts`, que nunca se commiteó. Además tenía la lógica de destino invertida (priorizaba `NEON_DATABASE_URL`).
- [x] (2026-11-16) **1.4 Commitear `docs/cierre-anual.md`.** Está sin versionar y es el diseño vigente del cierre anual.
- [x] (2026-11-16) **1.5 Fijar la región en el repo.**
  Agregar `vercel.json` con `{ "regions": ["gru1"] }` para que la región quede versionada y no dependa solo del dashboard.

## Fase 2: Entornos y variables (requiere confirmación del usuario en cada paso)

- [x] (2026-11-16) **2.1 Crear un branch de desarrollo en Neon** `dev` (`br-summer-wildflower-b6afj3tt`, endpoint `ep-empty-truth`) a partir de `production` (el branch por defecto se llama así, no `main`), en el mismo proyecto `AMiConsorcio`.
  Por qué: hoy el `.env` local apunta a la base de producción.
- [x] (2026-11-16) **2.2 Arreglar `DATABASE_URL` de Preview/Development en Vercel.**
  Hoy apunta a `ep-icy-queen` (us-east-1), una base que ya no existe y cuyas credenciales son inválidas. Reemplazarla por la URL pooler del branch `dev`.
- [x] (2026-11-16) **2.3 Limpiar el `.env` local.**
  Apuntar `DATABASE_URL` al branch `dev`. Eliminar `SUPRABASE_DATABASE_URL` y `NEON_DATABASE_URL`, y también `BETTER_AUTH_SECRET` si se confirma que no se usa (el proyecto usa Auth.js). Guardar la URL de producción aparte, solo para backups.
- [x] (2026-11-16) **2.4 Revisar la URL de producción** en el dashboard de Neon/Vercel: que use el host `-pooler` y `sslmode=require`.
  No se puede leer desde el CLI porque es *Sensitive*; lo verifica el usuario.
  Resultado: como el valor es Secret y no se puede leer, se reemplazó por la URL pooler conocida (`ep-old-bonus-...-pooler`, `sslmode=require`, `pgbouncer=true`, `connect_timeout=10`) con `vercel env update` y se hizo redeploy (`consorcios-cr2kfhw2q`). Sin errores.
- [x] (2026-11-16) **2.5 Verificar las secuencias** de la base de producción: el `max(id)` de cada tabla debe coincidir con `last_value` de su secuencia.
  Por qué: la migración de datos copió filas con IDs explícitos. Ya hubo colisiones en `EnvioEmail` y en los jobs (commits `6586caf` y `3b8d07b`). Consulta de solo lectura; si hay desfasajes, corregir con `setval` previa confirmación.
  Resultado: 6 desfasadas (`Asamblea`, `AsambleaOrdenDia`, `AsambleaVotacion`, `AsambleaVotacionVoto`, `RespuestaEmail`, `RespuestaEmailSaliente`), corregidas con `setval(seq, max(id), true)` en producción y en `dev`. Las otras 22 estaban bien.

## Fase 3: Verificación

- [x] (2026-11-16) **3.1** Confirmar con el usuario que la navegación en producción volvió a ser rápida tras el cambio a `gru1`.
- [x] (2026-11-16) **3.2** Hacer `npm run build` local apuntando al branch `dev`, sin errores.
- [x] (2026-11-16) **3.3** Hacer un deploy de producción con el repo ya limpio (fase 1) y probar el login, una liquidación existente (PDF) y la página de expensas.
- [x] (2026-11-16) **3.4** Actualizar el historial de `.claude/CLAUDE.md` y borrar este plan (o marcarlo como cerrado).

## Fuera de alcance (anotar, no hacer ahora)

- Deduplicar `auth()` / `getAccessContext()` con `cache()` de React en el layout.
- Persistir PDFs de liquidación fuera de `/tmp`.
- Migrar montos de `Float` a `Decimal` antes del cierre anual.
- Eliminar `better-sqlite3` y `scripts/migrate-sqlite-to-postgres.ts` (migración SQLite ya terminada).
- `dev` es copia de producción con emails reales de propietarios: aislar Resend en Preview/Development (otra API key o modo prueba) o anonimizar emails en `dev`.
- Quitar `BETTER_AUTH_SECRET` de Vercel (los 3 entornos): no se usa en el código.
- `scripts/backup-db.ps1` es de la época SQLite (copia `dev.db`): no respalda Neon. Reescribirlo con `pg_dump` sobre `PROD_DATABASE_URL`.
