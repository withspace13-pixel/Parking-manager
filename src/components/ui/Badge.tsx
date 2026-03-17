"use client";

type Variant = "success" | "destructive" | "secondary";

const variants: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  destructive: "bg-red-50 text-red-600 border-red-200/60",
  secondary: "bg-slate-100 text-slate-600 border-slate-200/60",
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
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
