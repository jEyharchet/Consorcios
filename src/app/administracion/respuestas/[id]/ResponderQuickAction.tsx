"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

function ReplyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M8 6 4 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10h6c3 0 5 2 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ResponderQuickAction({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <button
      type="button"
      aria-label="Responder"
      title="Responder"
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("reply", "1");
        router.replace(`${pathname}?${params.toString()}#reply-editor`, { scroll: false });
      }}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <ReplyIcon />
    </button>
  );
}
