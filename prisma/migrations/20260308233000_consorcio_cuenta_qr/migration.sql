-- AlterTable
ALTER TABLE "ConsorcioCuentaBancaria"
ADD COLUMN "qrEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConsorcioCuentaBancaria"
ADD COLUMN "qrMode" TEXT;

-- AlterTable
ALTER TABLE "ConsorcioCuentaBancaria"
ADD COLUMN "qrPayloadTemplate" TEXT;

-- AlterTable
ALTER TABLE "ConsorcioCuentaBancaria"
ADD COLUMN "qrLabel" TEXT;

-- AlterTable
ALTER TABLE "ConsorcioCuentaBancaria"
ADD COLUMN "qrExperimental" BOOLEAN NOT NULL DEFAULT false;
