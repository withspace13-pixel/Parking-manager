"use client";

type Variant = "success" | "destructive" | "secondary";

const variants: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  destructive: "bg-rose-50 text-rose-600 border-rose-200",
  secondary: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Badge({
  children,
  variant = "secondary",
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
