"use client";

import { useFormStatus } from "react-dom";

type DecisionSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  tone: "primary" | "secondary";
};

export default function DecisionSubmitButton({ idleLabel, pendingLabel, tone }: DecisionSubmitButtonProps) {
  const { pending } = useFormStatus();

  const className =
    tone === "primary"
      ? "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      : "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
