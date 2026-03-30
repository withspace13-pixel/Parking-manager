const STORAGE_KEY = "pm_recent_org_names_v1";

export function loadRecentOrgNamesFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

/** 등록 성공 시 최근 기관명 목록 앞에 추가 (다음 방문 시 자동완성 우선 표시) */
export function rememberOrgName(name: string): void {
  if (typeof window === "undefined") return;
  const t = name.trim();
  if (!t) return;
  const prev = loadRecentOrgNamesFromStorage();
  const next = [t, ...prev.filter((x) => x !== t)].slice(0, 40);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

/** 최근 사용 → 나머지 가나다순, 중복 제거 */
export function mergeOrgNameSuggestions(recent: string[], fromRecords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of recent) {
    const t = n.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  const rest = [...fromRecords]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
  for (const t of rest) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 200);
}

/**
 * 기관명 자동완성 후보: JSON에 적은 목록 순서 우선, 이어서 이 브라우저에서 최근 등록한 기관명(중복 제외).
 */
export function buildOrgNameList(favoriteFromFile: string[], recent: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of favoriteFromFile) {
    const t = n.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  for (const n of recent) {
    const t = n.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 100);
}
