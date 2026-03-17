const FORCE_DEV_KEY = "parking-manager-force-dev";

/**
 * Supabase URL이 없거나 placeholder면 개발자 모드.
 * 브라우저에서 localStorage에 parking-manager-force-dev=1 이면 무조건 개발자 모드.
 */
export function isDevMode(): boolean {
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem(FORCE_DEV_KEY) === "1") return true;
    } catch (_) {}
  }
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    return !url || url.includes("placeholder");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return !url || url.includes("placeholder");
}

/** 테스트용 개발자 모드 강제 켜기 (localStorage 설정 후 새로고침 필요) */
export function setForceDevMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(FORCE_DEV_KEY, "1");
    else localStorage.removeItem(FORCE_DEV_KEY);
  } catch (_) {}
}

export const DEV_STORAGE_KEY = "parking-manager-dev";
