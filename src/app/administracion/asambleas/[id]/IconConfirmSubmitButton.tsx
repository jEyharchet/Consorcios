"use client";

import type { ReactNode } from "react";

type IconConfirmSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  message: string;
  title: string;
};

export default function IconConfirmSubmitButton({
  children,
  className,
  message,
  title,
}: IconConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      title={title}
      aria-label={title}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
