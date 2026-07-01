// 기관명 자동완성 최근 사용 목록 (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchRecentOrgNames(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("recent_org_names")
    .select("name")
    .order("used_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("[recent_org_names fetch]", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => String(row.name ?? "").trim())
    .filter(Boolean);
}

export async function rememberOrgName(supabase: SupabaseClient, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("recent_org_names").upsert(
    { name: trimmed, used_at: new Date().toISOString() },
    { onConflict: "name" }
  );
  if (error) console.warn("[recent_org_names upsert]", error.message);
}

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
