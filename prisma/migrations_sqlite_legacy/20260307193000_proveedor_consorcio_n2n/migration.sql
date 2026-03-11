PRAGMA foreign_keys=OFF;

CREATE TABLE "ProveedorConsorcio" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "proveedorId" INTEGER NOT NULL,
  "consorcioId" INTEGER NOT NULL,
  "desde" DATETIME NOT NULL,
  "hasta" DATETIME,
  CONSTRAINT "ProveedorConsorcio_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProveedorConsorcio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ProveedorConsorcio" ("proveedorId", "consorcioId", "desde", "hasta")
SELECT "id", "consorcioId", "fechaInicio", "fechaBaja"
FROM "Proveedor";

CREATE TABLE "new_Proveedor" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "nombre" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "subtipo" TEXT,
  "telefono" TEXT,
  "email" TEXT,
  "fechaInicio" DATETIME NOT NULL,
  "fechaBaja" DATETIME,
  "evaluacionPromedio" REAL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Proveedor" ("id", "nombre", "tipo", "subtipo", "telefono", "email", "fechaInicio", "fechaBaja", "evaluacionPromedio", "activo", "createdAt", "updatedAt")
SELECT "id", "nombre", "tipo", "subtipo", "telefono", "email", "fechaInicio", "fechaBaja", "evaluacionPromedio", "activo", "createdAt", "updatedAt"
FROM "Proveedor";

DROP TABLE "Proveedor";
ALTER TABLE "new_Proveedor" RENAME TO "Proveedor";

CREATE INDEX "Proveedor_nombre_idx" ON "Proveedor"("nombre");
CREATE INDEX "ProveedorConsorcio_proveedorId_idx" ON "ProveedorConsorcio"("proveedorId");
CREATE INDEX "ProveedorConsorcio_consorcioId_idx" ON "ProveedorConsorcio"("consorcioId");
CREATE UNIQUE INDEX "ProveedorConsorcio_proveedorId_consorcioId_key" ON "ProveedorConsorcio"("proveedorId", "consorcioId");
CREATE INDEX "ProveedorConsorcio_proveedorId_consorcioId_idx" ON "ProveedorConsorcio"("proveedorId", "consorcioId");

PRAGMA foreign_keys=ON;
