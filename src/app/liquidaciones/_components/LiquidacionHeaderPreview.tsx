type HeaderAdminData = {
  nombre: string;
  telefono: string | null;
  email: string | null;
};

type HeaderConsorcioData = {
  nombre: string;
  tituloLegal: string | null;
  cuit: string | null;
  direccion: string;
  ciudad: string | null;
  provincia: string | null;
};

type LiquidacionHeaderPreviewProps = {
  mesCierre: string;
  fechaVencimiento: string;
  administrador: HeaderAdminData | null;
  consorcio: HeaderConsorcioData;
};

function buildConsorcioDomicilio(consorcio: HeaderConsorcioData) {
  const ciudadProvincia = [consorcio.ciudad, consorcio.provincia].filter(Boolean).join(", ");
  return ciudadProvincia ? `${consorcio.direccion}, ${ciudadProvincia}` : consorcio.direccion;
}

export function LiquidacionHeaderPreview({
  mesCierre,
  fechaVencimiento,
  administrador,
  consorcio,
}: LiquidacionHeaderPreviewProps) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold uppercase text-slate-900">LIQUIDACION DE EXPENSAS</h1>
      <p className="mt-2 text-xs font-medium text-slate-700">
        MES DE LIQUIDACION (CIERRE): {mesCierre} - FECHA DE VENCIMIENTO DE LAS EXPENSAS: {fechaVencimiento}
      </p>

      <div className="mt-3 h-px w-full bg-slate-300" />

      <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr_1fr] md:items-start">
        <div className="h-20 w-[120px] rounded border border-slate-300 bg-white" />

        <div className="text-sm text-slate-700">
          <p className="font-semibold text-slate-900">ADMINISTRADOR</p>
          <p className="font-semibold text-slate-900">{administrador?.nombre ?? "Administrador no asignado"}</p>
          <p>Tel: {administrador?.telefono ?? "-"}</p>
          <p>Email: {administrador?.email ?? "-"}</p>
        </div>

        <div className="text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{consorcio.nombre}</p>
          <p className="text-xs uppercase tracking-wide text-slate-600">{consorcio.tituloLegal ?? "-"}</p>
          <p>CUIT: {consorcio.cuit ?? "-"}</p>
          <p>{buildConsorcioDomicilio(consorcio)}</p>
        </div>
      </div>

      <p className="mt-5 text-base font-semibold text-slate-900">Detalle de gastos, ingresos y saldos de {mesCierre}</p>
    </header>
  );
}


