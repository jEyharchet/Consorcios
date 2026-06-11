# AmiConsorcio

## Prisma + Neon

Prisma usa `DATABASE_URL` con el pooler de Neon para runtime y migraciones en esta configuracion.

Ejemplo de configuracion:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=10"
```

## Migraciones Prisma

No edites migraciones ya aplicadas.

Las migraciones en `prisma/migrations/**/migration.sql` quedan protegidas en `.gitattributes` con `-text` para evitar normalizacion automatica de BOM o line endings, ya que esos cambios pueden provocar checksum mismatch en Prisma aunque el SQL no cambie funcionalmente.

## Traffic Guard temporal

Para reducir trafico no deseado antes de que cargue la app en Vercel, el middleware soporta un guard activable por variables de entorno.

Variables:

```env
TRAFFIC_GUARD_ENABLED=false
TRAFFIC_GUARD_ALLOWED_COUNTRIES=AR
TRAFFIC_GUARD_SECRET=un-secreto-largo-y-unico
```

Reglas:

- Si `TRAFFIC_GUARD_ENABLED=true`, solo se permiten requests desde los paises listados en `TRAFFIC_GUARD_ALLOWED_COUNTRIES`.
- Si `TRAFFIC_GUARD_ALLOWED_COUNTRIES` falta o queda vacia, se usa `AR`.
- Se puede hacer bypass para pruebas con:
  - header `x-traffic-guard-secret`
  - query param `traffic_guard_secret`
- El secreto debe coincidir exactamente con `TRAFFIC_GUARD_SECRET`.
- Rutas tipicas de scanners como `/wp-admin`, `/wp-login.php`, `/xmlrpc.php`, `/.env`, `/phpmyadmin` y cualquier `.php` quedan bloqueadas siempre con `403`.

Pruebas locales:

1. Configura:

```env
TRAFFIC_GUARD_ENABLED=true
TRAFFIC_GUARD_ALLOWED_COUNTRIES=AR
TRAFFIC_GUARD_SECRET=mi-secreto-local
```

2. Inicia la app con `npm run dev`.

3. Simula un request permitido:

```bash
curl -I -H "x-vercel-ip-country: AR" http://localhost:3000/login
```

4. Simula un request bloqueado:

```bash
curl -I -H "x-vercel-ip-country: SG" http://localhost:3000/login
```

5. Simula bypass manual:

```bash
curl -I "http://localhost:3000/login?traffic_guard_secret=mi-secreto-local"
```

Pruebas en Vercel:

- Define las mismas variables en Production.
- Activa `TRAFFIC_GUARD_ENABLED=true`.
- Verifica acceso normal desde Argentina.
- Verifica bypass propio agregando el header `x-traffic-guard-secret` en una herramienta como cURL, Bruno o Postman.
