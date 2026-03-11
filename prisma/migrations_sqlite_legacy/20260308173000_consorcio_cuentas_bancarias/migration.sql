-- CreateTable
CREATE TABLE "ConsorcioCuentaBancaria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
    "banco" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "cbu" TEXT NOT NULL,
    "alias" TEXT,
    "cuitTitular" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "esCuentaExpensas" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsorcioCuentaBancaria_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConsorcioCuentaBancaria_consorcioId_idx" ON "ConsorcioCuentaBancaria"("consorcioId");

-- CreateIndex
CREATE INDEX "ConsorcioCuentaBancaria_consorcioId_esCuentaExpensas_idx" ON "ConsorcioCuentaBancaria"("consorcioId", "esCuentaExpensas");

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "ConsorcioCuentaBancaria_unique_expensas_per_consorcio"
ON "ConsorcioCuentaBancaria"("consorcioId")
WHERE "esCuentaExpensas" = 1;

