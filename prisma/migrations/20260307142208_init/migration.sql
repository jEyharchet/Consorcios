-- CreateTable
CREATE TABLE "Consorcio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "tituloLegal" TEXT,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "cuit" TEXT,
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Unidad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DEPARTAMENTO',
    "piso" TEXT,
    "departamento" TEXT,
    "superficie" REAL,
    "porcentajeExpensas" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Unidad_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnidadPersona" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "unidadId" INTEGER NOT NULL,
    "personaId" INTEGER NOT NULL,
    "desde" DATETIME NOT NULL,
    "hasta" DATETIME,
    CONSTRAINT "UnidadPersona_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UnidadPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsorcioAdministrador" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
    "personaId" INTEGER NOT NULL,
    "desde" DATETIME NOT NULL,
    "hasta" DATETIME,
    "actaNombreOriginal" TEXT,
    "actaMimeType" TEXT,
    "actaPath" TEXT,
    "actaSubidaAt" DATETIME,
    CONSTRAINT "ConsorcioAdministrador_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsorcioAdministrador_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaEmision" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" DATETIME,
    "total" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liquidacion_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expensa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "liquidacionId" INTEGER NOT NULL,
    "unidadId" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "saldo" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expensa_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expensa_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "expensaId" INTEGER NOT NULL,
    "fechaPago" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" REAL NOT NULL,
    "medioPago" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "referencia" TEXT,
    "nota" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pago_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "Expensa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Proveedor_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "consorcioId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "liquidacionId" INTEGER,
    "fecha" DATETIME NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoExpensa" TEXT NOT NULL,
    "rubroExpensa" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "comprobantePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Gasto_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Gasto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Gasto_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserConsorcio" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LECTURA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserConsorcio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserConsorcio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Unidad_consorcioId_idx" ON "Unidad"("consorcioId");

-- CreateIndex
CREATE UNIQUE INDEX "Unidad_consorcioId_identificador_key" ON "Unidad"("consorcioId", "identificador");

-- CreateIndex
CREATE INDEX "Persona_apellido_nombre_idx" ON "Persona"("apellido", "nombre");

-- CreateIndex
CREATE INDEX "Persona_email_idx" ON "Persona"("email");

-- CreateIndex
CREATE INDEX "UnidadPersona_unidadId_personaId_idx" ON "UnidadPersona"("unidadId", "personaId");

-- CreateIndex
CREATE INDEX "UnidadPersona_personaId_idx" ON "UnidadPersona"("personaId");

-- CreateIndex
CREATE INDEX "ConsorcioAdministrador_consorcioId_idx" ON "ConsorcioAdministrador"("consorcioId");

-- CreateIndex
CREATE INDEX "ConsorcioAdministrador_personaId_idx" ON "ConsorcioAdministrador"("personaId");

-- CreateIndex
CREATE INDEX "ConsorcioAdministrador_consorcioId_personaId_idx" ON "ConsorcioAdministrador"("consorcioId", "personaId");

-- CreateIndex
CREATE INDEX "Liquidacion_consorcioId_idx" ON "Liquidacion"("consorcioId");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_consorcioId_periodo_key" ON "Liquidacion"("consorcioId", "periodo");

-- CreateIndex
CREATE INDEX "Expensa_unidadId_idx" ON "Expensa"("unidadId");

-- CreateIndex
CREATE INDEX "Expensa_liquidacionId_idx" ON "Expensa"("liquidacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Expensa_liquidacionId_unidadId_key" ON "Expensa"("liquidacionId", "unidadId");

-- CreateIndex
CREATE INDEX "Pago_expensaId_idx" ON "Pago"("expensaId");

-- CreateIndex
CREATE INDEX "Pago_fechaPago_idx" ON "Pago"("fechaPago");

-- CreateIndex
CREATE INDEX "Proveedor_consorcioId_idx" ON "Proveedor"("consorcioId");

-- CreateIndex
CREATE INDEX "Proveedor_nombre_idx" ON "Proveedor"("nombre");

-- CreateIndex
CREATE INDEX "Gasto_consorcioId_idx" ON "Gasto"("consorcioId");

-- CreateIndex
CREATE INDEX "Gasto_proveedorId_idx" ON "Gasto"("proveedorId");

-- CreateIndex
CREATE INDEX "Gasto_liquidacionId_idx" ON "Gasto"("liquidacionId");

-- CreateIndex
CREATE INDEX "Gasto_periodo_idx" ON "Gasto"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "UserConsorcio_consorcioId_idx" ON "UserConsorcio"("consorcioId");

-- CreateIndex
CREATE UNIQUE INDEX "UserConsorcio_userId_consorcioId_key" ON "UserConsorcio"("userId", "consorcioId");
