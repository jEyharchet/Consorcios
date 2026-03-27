"use client";

export default function ResponderQuickAction() {
  return (
    <button
      type="button"
      aria-label="Responder"
      title="Responder"
      onClick={() => {
        console.log("responder");
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 text-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      ↩
    </button>
  );
}
