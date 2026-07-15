// 설문 공통 상단 이미지 (전 템플릿·캠페인 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";

const SHARED_ID = "default";
const DEV_KEY = "parking-manager-survey-shared-header";

let memoryCache: string | null | undefined;

export function invalidateSurveySharedHeaderCache() {
  memoryCache = undefined;
}

function readDevHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}

function writeDevHeader(url: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (url) localStorage.setItem(DEV_KEY, url);
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
}

/** 세션 내 1회 DB 조회 후 메모리 캐시 — 템플릿마다 이미지를 다시 받지 않음 */
export async function fetchSurveySharedHeaderImage(
  supabase: SupabaseClient
): Promise<string | null> {
  if (memoryCache !== undefined) return memoryCache;

  if (isDevMode()) {
    memoryCache = readDevHeader();
    return memoryCache;
  }

  const { data, error } = await supabase
    .from("survey_shared_settings")
    .select("header_image_url")
    .eq("id", SHARED_ID)
    .maybeSingle();

  if (error) {
    console.warn("[survey_shared_settings]", error.message);
    memoryCache = null;
    return null;
  }

  memoryCache = (data?.header_image_url as string | null) ?? null;
  return memoryCache;
}

export async function upsertSurveySharedHeaderImage(
  supabase: SupabaseClient,
  headerImageUrl: string | null
): Promise<void> {
  const value = headerImageUrl?.trim() || null;

  if (isDevMode()) {
    writeDevHeader(value);
    memoryCache = value;
    return;
  }

  const { error } = await supabase.from("survey_shared_settings").upsert(
    {
      id: SHARED_ID,
      header_image_url: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  memoryCache = value;
}
