"use client";

type Props = {
  className?: string;
  label: string;
  confirmMessage: string;
};

export default function ConfirmSubmitButton({ className, label, confirmMessage }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
