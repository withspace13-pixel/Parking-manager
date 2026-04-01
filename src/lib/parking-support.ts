import type { ParkingSupport as ParkingSupportDb } from "@/lib/supabase";

/** DB·API 저장값: yes=O, no=X, undecided=미정, needs_check=확인 필요 */
export type ParkingSupport = ParkingSupportDb;

const ORDER: ParkingSupport[] = ["yes", "no", "undecided", "needs_check"];

export function parseParkingSupport(v: unknown): ParkingSupport {
  if (v === "yes" || v === "no" || v === "undecided" || v === "needs_check") return v;
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v == null) return "undecided";
  if (typeof v === "string" && ORDER.includes(v as ParkingSupport)) return v as ParkingSupport;
  return "no";
}

export function cycleParkingSupport(current: ParkingSupport): ParkingSupport {
  const i = ORDER.indexOf(current);
  return ORDER[(i === -1 ? 0 : i + 1) % ORDER.length];
}

/** 카드·배지 등 짧은 표기 */
export function parkingSupportShortLabel(v: ParkingSupport): string {
  switch (v) {
    case "yes":
      return "O";
    case "no":
      return "X";
    case "undecided":
      return "미정";
    case "needs_check":
      return "확인 필요";
  }
}

/** 필터 칩 등 좁은 공간용 */
export function parkingSupportFilterLabel(v: ParkingSupport): string {
  if (v === "needs_check") return "확인";
  return parkingSupportShortLabel(v);
}

export function parkingSupportUiClass(v: ParkingSupport): string {
  switch (v) {
    case "yes":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "no":
      return "border-rose-200 bg-rose-50 text-rose-600";
    case "undecided":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "needs_check":
      return "border-violet-200 bg-violet-50 text-violet-800";
  }
}

export function parkingSupportBadgeClass(v: ParkingSupport): string | undefined {
  if (v === "undecided") return "bg-amber-50 text-amber-700 border-amber-200";
  if (v === "needs_check") return "bg-violet-50 text-violet-800 border-violet-200";
  return undefined;
}

export function parkingSupportBadgeVariant(
  v: ParkingSupport
): "success" | "destructive" | "secondary" {
  if (v === "yes") return "success";
  if (v === "no") return "destructive";
  return "secondary";
}
