ALTER TABLE "Liquidacion" ADD COLUMN "mesRendicion" TEXT;
ALTER TABLE "Liquidacion" ADD COLUMN "mesVencimiento" TEXT;
ALTER TABLE "Liquidacion" ADD COLUMN "montoFondoReserva" REAL;
ALTER TABLE "Liquidacion" ADD COLUMN "montoOrdinarias" REAL;
ALTER TABLE "Liquidacion" ADD COLUMN "montoExtraordinarias" REAL;
ALTER TABLE "Liquidacion" ADD COLUMN "tasaInteresMensual" REAL;
ALTER TABLE "Liquidacion" ADD COLUMN "wizardPasoActual" INTEGER DEFAULT 1;
