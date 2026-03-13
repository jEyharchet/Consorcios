type ExpensaKpiItem = {
  label: string;
  value: string;
  detail: string;
};

type ExpensaKpisProps = {
  items: ExpensaKpiItem[];
};

export default function ExpensaKpis({ items }: ExpensaKpisProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
          <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
        </article>
      ))}
    </section>
  );
}
