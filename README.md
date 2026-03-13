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
