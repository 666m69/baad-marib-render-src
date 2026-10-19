import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";

export function Btn({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const look =
    variant === "primary"
      ? "bg-accent text-accent-fg hover:brightness-110"
      : variant === "danger"
        ? "bg-danger text-danger-fg hover:brightness-110"
        : "border border-line bg-surface-2 text-fg hover:bg-surface";
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-[filter,background-color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent";
