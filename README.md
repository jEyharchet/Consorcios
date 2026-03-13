# AmiConsorcio

## Prisma + Neon

Prisma usa `DATABASE_URL` con el pooler de Neon para runtime y migraciones en esta configuracion.

Ejemplo de configuracion:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=10"
```
