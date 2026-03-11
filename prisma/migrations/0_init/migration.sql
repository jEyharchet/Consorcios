-- PostgreSQL baseline for AmiConsorcio before onboarding.
-- This migration is intended to be marked as applied on the existing Neon database.

CREATE TABLE "Consorcio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tituloLegal" TEXT,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "cuit" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consorcio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Persona" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unidad" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DEPARTAMENTO',
    "piso" TEXT,
    "departamento" TEXT,
    "superficie" DOUBLE PRECISION,
    "porcentajeExpensas" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsorcioAdministrador" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "personaId" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),
    "actaNombreOriginal" TEXT,
    "actaMimeType" TEXT,
    "actaPath" TEXT,
    "actaSubidaAt" TIMESTAMP(3),

    CONSTRAINT "ConsorcioAdministrador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Liquidacion" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "mesRendicion" TEXT,
    "mesVencimiento" TEXT,
    "montoFondoReserva" DOUBLE PRECISION,
    "montoOrdinarias" DOUBLE PRECISION,
    "montoExtraordinarias" DOUBLE PRECISION,
    "tasaInteresMensual" DOUBLE PRECISION,
    "datosJuicios" TEXT,
    "recomendacionesGenerales" TEXT,
    "novedadesMes" TEXT,
    "wizardPasoActual" INTEGER DEFAULT 1,
    "total" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "boletaCuentaSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Proveedor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "subtipo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaBaja" TIMESTAMP(3),
    "evaluacionPromedio" DOUBLE PRECISION,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProveedorConsorcio" (
    "id" SERIAL NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),

    CONSTRAINT "ProveedorConsorcio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Gasto" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "liquidacionId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoExpensa" TEXT NOT NULL,
    "rubroExpensa" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "comprobantePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnidadPersona" (
    "id" SERIAL NOT NULL,
    "unidadId" INTEGER NOT NULL,
    "personaId" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),

    CONSTRAINT "UnidadPersona_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expensa" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "unidadId" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expensa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidacionDeuda" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "expensaId" INTEGER NOT NULL,
    "capitalOriginal" DOUBLE PRECISION NOT NULL,
    "interesCalculado" DOUBLE PRECISION NOT NULL,
    "criterio" TEXT NOT NULL,
    "importeLiquidado" DOUBLE PRECISION NOT NULL,
    "fechaCalculoInteres" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionDeuda_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidacionProrrateoUnidad" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "unidadId" INTEGER NOT NULL,
    "coeficiente" DOUBLE PRECISION NOT NULL,
    "saldoAnterior" DOUBLE PRECISION NOT NULL,
    "pagosPeriodo" DOUBLE PRECISION NOT NULL,
    "saldoDeudor" DOUBLE PRECISION NOT NULL,
    "saldoAFavor" DOUBLE PRECISION NOT NULL,
    "intereses" DOUBLE PRECISION NOT NULL,
    "gastoOrdinario" DOUBLE PRECISION NOT NULL,
    "redondeo" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiquidacionProrrateoUnidad_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "expensaId" INTEGER NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DOUBLE PRECISION NOT NULL,
    "medioPago" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "referencia" TEXT,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsorcioCuentaBancaria" (
    "id" SERIAL NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "banco" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "cbu" TEXT NOT NULL,
    "alias" TEXT,
    "cuitTitular" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "esCuentaExpensas" BOOLEAN NOT NULL DEFAULT false,
    "qrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "qrMode" TEXT,
    "qrPayloadTemplate" TEXT,
    "qrLabel" TEXT,
    "qrExperimental" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsorcioCuentaBancaria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "UserConsorcio" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "consorcioId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LECTURA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConsorcio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidacionArchivo" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "responsableGroupKey" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "reemplazadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionArchivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidacionRegeneracionJob" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "expectedFiles" INTEGER NOT NULL DEFAULT 0,
    "generatedFiles" INTEGER NOT NULL DEFAULT 0,
    "validatedFiles" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorDetail" TEXT,
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiquidacionRegeneracionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiquidacionGastoHistorico" (
    "id" SERIAL NOT NULL,
    "liquidacionId" INTEGER NOT NULL,
    "gastoOrigenId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipoExpensa" TEXT NOT NULL,
    "rubroExpensa" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "proveedorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionGastoHistorico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Unidad_consorcioId_identificador_key" ON "Unidad"("consorcioId", "identificador");
CREATE INDEX "Unidad_consorcioId_idx" ON "Unidad"("consorcioId");
CREATE INDEX "Persona_apellido_nombre_idx" ON "Persona"("apellido", "nombre");
CREATE INDEX "Persona_email_idx" ON "Persona"("email");
CREATE INDEX "UnidadPersona_unidadId_personaId_idx" ON "UnidadPersona"("unidadId", "personaId");
CREATE INDEX "UnidadPersona_personaId_idx" ON "UnidadPersona"("personaId");
CREATE INDEX "ConsorcioAdministrador_consorcioId_idx" ON "ConsorcioAdministrador"("consorcioId");
CREATE INDEX "ConsorcioAdministrador_personaId_idx" ON "ConsorcioAdministrador"("personaId");
CREATE INDEX "ConsorcioAdministrador_consorcioId_personaId_idx" ON "ConsorcioAdministrador"("consorcioId", "personaId");
CREATE UNIQUE INDEX "Liquidacion_consorcioId_periodo_key" ON "Liquidacion"("consorcioId", "periodo");
CREATE INDEX "Liquidacion_consorcioId_idx" ON "Liquidacion"("consorcioId");
CREATE UNIQUE INDEX "Expensa_liquidacionId_unidadId_key" ON "Expensa"("liquidacionId", "unidadId");
CREATE INDEX "Expensa_unidadId_idx" ON "Expensa"("unidadId");
CREATE INDEX "Expensa_liquidacionId_idx" ON "Expensa"("liquidacionId");
CREATE INDEX "LiquidacionDeuda_liquidacionId_idx" ON "LiquidacionDeuda"("liquidacionId");
CREATE INDEX "LiquidacionDeuda_expensaId_idx" ON "LiquidacionDeuda"("expensaId");
CREATE INDEX "LiquidacionDeuda_liquidacionId_expensaId_idx" ON "LiquidacionDeuda"("liquidacionId", "expensaId");
CREATE UNIQUE INDEX "LiquidacionProrrateoUnidad_liquidacionId_unidadId_key" ON "LiquidacionProrrateoUnidad"("liquidacionId", "unidadId");
CREATE INDEX "LiquidacionProrrateoUnidad_liquidacionId_idx" ON "LiquidacionProrrateoUnidad"("liquidacionId");
CREATE INDEX "LiquidacionProrrateoUnidad_unidadId_idx" ON "LiquidacionProrrateoUnidad"("unidadId");
CREATE INDEX "Pago_expensaId_idx" ON "Pago"("expensaId");
CREATE INDEX "Pago_fechaPago_idx" ON "Pago"("fechaPago");
CREATE INDEX "Proveedor_nombre_idx" ON "Proveedor"("nombre");
CREATE UNIQUE INDEX "ProveedorConsorcio_proveedorId_consorcioId_key" ON "ProveedorConsorcio"("proveedorId", "consorcioId");
CREATE INDEX "ProveedorConsorcio_proveedorId_idx" ON "ProveedorConsorcio"("proveedorId");
CREATE INDEX "ProveedorConsorcio_consorcioId_idx" ON "ProveedorConsorcio"("consorcioId");
CREATE INDEX "ProveedorConsorcio_proveedorId_consorcioId_idx" ON "ProveedorConsorcio"("proveedorId", "consorcioId");
CREATE INDEX "Gasto_consorcioId_idx" ON "Gasto"("consorcioId");
CREATE INDEX "Gasto_proveedorId_idx" ON "Gasto"("proveedorId");
CREATE INDEX "Gasto_liquidacionId_idx" ON "Gasto"("liquidacionId");
CREATE INDEX "Gasto_periodo_idx" ON "Gasto"("periodo");
CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_idx" ON "LiquidacionGastoHistorico"("liquidacionId");
CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_tipoExpensa_idx" ON "LiquidacionGastoHistorico"("liquidacionId", "tipoExpensa");
CREATE INDEX "LiquidacionGastoHistorico_liquidacionId_rubroExpensa_idx" ON "LiquidacionGastoHistorico"("liquidacionId", "rubroExpensa");
CREATE INDEX "ConsorcioCuentaBancaria_consorcioId_idx" ON "ConsorcioCuentaBancaria"("consorcioId");
CREATE INDEX "ConsorcioCuentaBancaria_consorcioId_esCuentaExpensas_idx" ON "ConsorcioCuentaBancaria"("consorcioId", "esCuentaExpensas");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "UserConsorcio_userId_consorcioId_key" ON "UserConsorcio"("userId", "consorcioId");
CREATE INDEX "UserConsorcio_consorcioId_idx" ON "UserConsorcio"("consorcioId");
CREATE INDEX "LiquidacionArchivo_liquidacionId_idx" ON "LiquidacionArchivo"("liquidacionId");
CREATE INDEX "LiquidacionArchivo_tipoArchivo_idx" ON "LiquidacionArchivo"("tipoArchivo");
CREATE INDEX "LiquidacionArchivo_liquidacionId_activo_idx" ON "LiquidacionArchivo"("liquidacionId", "activo");
CREATE INDEX "LiquidacionRegeneracionJob_liquidacionId_idx" ON "LiquidacionRegeneracionJob"("liquidacionId");
CREATE INDEX "LiquidacionRegeneracionJob_status_idx" ON "LiquidacionRegeneracionJob"("status");
CREATE INDEX "LiquidacionRegeneracionJob_liquidacionId_createdAt_idx" ON "LiquidacionRegeneracionJob"("liquidacionId", "createdAt");

ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsorcioAdministrador" ADD CONSTRAINT "ConsorcioAdministrador_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsorcioAdministrador" ADD CONSTRAINT "ConsorcioAdministrador_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProveedorConsorcio" ADD CONSTRAINT "ProveedorConsorcio_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProveedorConsorcio" ADD CONSTRAINT "ProveedorConsorcio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UnidadPersona" ADD CONSTRAINT "UnidadPersona_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnidadPersona" ADD CONSTRAINT "UnidadPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expensa" ADD CONSTRAINT "Expensa_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expensa" ADD CONSTRAINT "Expensa_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionDeuda" ADD CONSTRAINT "LiquidacionDeuda_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionDeuda" ADD CONSTRAINT "LiquidacionDeuda_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "Expensa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionProrrateoUnidad" ADD CONSTRAINT "LiquidacionProrrateoUnidad_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionProrrateoUnidad" ADD CONSTRAINT "LiquidacionProrrateoUnidad_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_expensaId_fkey" FOREIGN KEY ("expensaId") REFERENCES "Expensa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsorcioCuentaBancaria" ADD CONSTRAINT "ConsorcioCuentaBancaria_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserConsorcio" ADD CONSTRAINT "UserConsorcio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserConsorcio" ADD CONSTRAINT "UserConsorcio_consorcioId_fkey" FOREIGN KEY ("consorcioId") REFERENCES "Consorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionArchivo" ADD CONSTRAINT "LiquidacionArchivo_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionRegeneracionJob" ADD CONSTRAINT "LiquidacionRegeneracionJob_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiquidacionGastoHistorico" ADD CONSTRAINT "LiquidacionGastoHistorico_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
