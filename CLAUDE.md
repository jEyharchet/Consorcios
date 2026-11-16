# AmiConsorcio

App web para administrar consorcios de propiedad horizontal en Argentina (foco en Provincia de Buenos Aires).
Consorcio de referencia en producción: **Jara 166**. Dominio: `app.amiconsorcio.com.ar`.

## Stack

- Next.js 14 (App Router, Server Components + Server Actions), React 18, Tailwind, TypeScript.
- Prisma 5 + PostgreSQL en **Neon** (`sa-east-1`, São Paulo). Proyecto Neon: `AMiConsorcio`.
- Auth.js v5 (`auth.ts`, `auth.config.ts`): Google OAuth, sesión JWT, `PrismaAdapter`.
- PDFs con `puppeteer-core` + `@sparticuz/chromium` a partir de HTML.
- Email saliente con Resend; respuestas entrantes vía Resend/Mailgun (`/api/email/respuestas`).
- Deploy en Vercel (proyecto `consorcios`), Node 24, Fluid Compute, funciones en **`gru1`** (São Paulo).

## Comandos

- `npm run dev` / `npm run build` (incluye `prisma generate`) / `npm run lint`
- `npm run backup:db` (PowerShell)
- No hay tests automatizados; hay scripts manuales en `scripts/test-*.ts` (`npx tsx scripts/<archivo>.ts`).

## Estructura

- `src/app/**`: páginas por módulo (`consorcios`, `unidades`, `personas`, `proveedores`, `gastos`, `liquidaciones`, `expensas`, `tesoreria`, `administracion` (asambleas, comunicaciones, respuestas), `votaciones`, `onboarding`, `usuarios`).
- `src/app/api/**`: route handlers (PDF, jobs de liquidación, comprobantes, firmas, email entrante).
- `src/lib/**`: lógica de dominio. Archivos clave:
  - `auth.ts`: `requireAuth`, `requireConsorcioAccess`, `requireConsorcioRole`, `getAccessContext`.
  - `liquidacion-prorrateo.ts`: prorrateo por coeficiente + redondeo auditable (mayor residuo).
  - `liquidacion-paso4.ts`, `liquidacion-cierre.ts`, `liquidacion-pdf-html.ts`, `liquidacion-email.ts`: cierre, PDFs y envío.
  - `liquidacion-regeneracion-job.ts`: jobs asíncronos disparados por `fetch` interno a `/api/liquidaciones/regeneracion-jobs/[jobId]/run` con token HMAC.
  - `cobranzas-expensas.ts`, `tesoreria.ts`, `pagos-gastos.ts`, `fondos.ts`: cobros, caja/bancos y `MovimientoFondo` (saldo anterior/posterior).
- `src/middleware.ts`: exige sesión + traffic guard (filtro por país, bloqueo de rutas de scanners).
- `docs/`: documentos de diseño (ej. `cierre-anual.md`).

## Dominio

- Roles globales: `SUPER_ADMIN` / `USER` (el primer usuario creado es `SUPER_ADMIN`).
- Roles por consorcio: `ADMIN` / `OPERADOR` / `LECTURA`. Se derivan de `ConsorcioAdministrador`, `UnidadPersona` (vigentes por `desde`/`hasta`) y `UserConsorcio` (legacy).
- `UnidadPersona`: tipo de relación, % de ordinarias y extraordinarias, `recibeLiquidacion`, vigencia.
- Liquidación: wizard de 4 pasos → prorrateo → expensas por unidad → PDFs por grupo de responsables → emails.
- Montos como `Float` y estados como `String` libres (no enums). Respetar los valores existentes.

## Reglas

- **No editar migraciones ya aplicadas** (`prisma/migrations/**/migration.sql`): cambios de BOM/CRLF rompen el checksum de Prisma. Para cambios de esquema, crear una migración nueva.
- Toda acción sobre datos de un consorcio debe pasar por `requireConsorcioAccess` / `requireConsorcioRole`.
- En Vercel los PDFs de liquidación se escriben en `/tmp` (efímero); comprobantes, actas y firmas se guardan como `Bytes` en la base.
- Mantener la región de funciones de Vercel igual a la región de la base (hoy ambas en São Paulo). Si difieren, cada clic se vuelve lento.
- Textos de UI y documentación en español.
