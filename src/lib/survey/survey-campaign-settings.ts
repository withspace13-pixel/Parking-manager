// 만족도 설문 캠페인별 상단 제목·소개·이미지 설정
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  DEFAULT_SURVEY_CAMPAIGN_TITLE,
  DEFAULT_SURVEY_INTRO_TEXT,
  type SurveyCampaignSettings,
} from "@/lib/survey/types";

const cache = new Map<string, SurveyCampaignSettings>();
const headerCache = new Map<string, string | null>();

export function invalidateSurveyCampaignSettingsCache(campaignKey?: string) {
  if (campaignKey) {
    cache.delete(campaignKey);
    headerCache.delete(campaignKey);
  } else {
    cache.clear();
    headerCache.clear();
  }
}

/** 네트워크 없이 캐시·UI 동기화 (템플릿 적용 직후) */
export function seedSurveyCampaignSettingsCache(settings: SurveyCampaignSettings) {
  cache.set(settings.campaignKey, settings);
  headerCache.set(settings.campaignKey, settings.headerImageUrl);
}

function defaults(campaignKey: string): SurveyCampaignSettings {
  return {
    campaignKey,
    title: DEFAULT_SURVEY_CAMPAIGN_TITLE,
    introText: DEFAULT_SURVEY_INTRO_TEXT,
    headerImageUrl: null,
  };
}

export async function fetchSurveyCampaignSettings(
  supabase: SupabaseClient,
  campaignKey: string,
  options?: { includeHeader?: boolean }
): Promise<SurveyCampaignSettings> {
  const includeHeader = options?.includeHeader !== false;
  const cached = cache.get(campaignKey);
  if (cached) {
    if (includeHeader) {
      if (cached.headerImageUrl) return cached;
    } else {
      return { ...cached, headerImageUrl: null };
    }
  }

  if (isDevMode()) {
    const s = devSurveyStore.getCampaignSettings(campaignKey);
    cache.set(campaignKey, s);
    if (s.headerImageUrl) headerCache.set(campaignKey, s.headerImageUrl);
    return includeHeader ? s : { ...s, headerImageUrl: null };
  }

  if (includeHeader) {
    const { data, error } = await supabase
      .from("survey_campaign_settings")
      .select("campaign_key, title, intro_text, header_image_url")
      .eq("campaign_key", campaignKey)
      .maybeSingle();

    if (error || !data) {
      const d = defaults(campaignKey);
      cache.set(campaignKey, d);
      return d;
    }

    const settings: SurveyCampaignSettings = {
      campaignKey: data.campaign_key,
      title: data.title || DEFAULT_SURVEY_CAMPAIGN_TITLE,
      introText: data.intro_text || DEFAULT_SURVEY_INTRO_TEXT,
      headerImageUrl: data.header_image_url,
    };
    cache.set(campaignKey, settings);
    if (data.header_image_url) headerCache.set(campaignKey, data.header_image_url);
    return settings;
  }

  const { data, error } = await supabase
    .from("survey_campaign_settings")
    .select("campaign_key, title, intro_text")
    .eq("campaign_key", campaignKey)
    .maybeSingle();

  if (error || !data) {
    const d = defaults(campaignKey);
    cache.set(campaignKey, d);
    return d;
  }

  const settings: SurveyCampaignSettings = {
    campaignKey: data.campaign_key,
    title: data.title || DEFAULT_SURVEY_CAMPAIGN_TITLE,
    introText: data.intro_text || DEFAULT_SURVEY_INTRO_TEXT,
    headerImageUrl: null,
  };
  cache.set(campaignKey, settings);
  return settings;
}

/** 상단 이미지만 별도 조회 — 초기 로딩 egress 절감 */
export async function fetchSurveyCampaignHeaderImage(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<string | null> {
  if (headerCache.has(campaignKey)) {
    return headerCache.get(campaignKey) ?? null;
  }

  const cached = cache.get(campaignKey);
  if (cached?.headerImageUrl) {
    return cached.headerImageUrl;
  }

  if (isDevMode()) {
    const s = devSurveyStore.getCampaignSettings(campaignKey);
    headerCache.set(campaignKey, s.headerImageUrl);
    if (cached) {
      cache.set(campaignKey, { ...cached, headerImageUrl: s.headerImageUrl });
    }
    return s.headerImageUrl;
  }

  const { data, error } = await supabase
    .from("survey_campaign_settings")
    .select("header_image_url")
    .eq("campaign_key", campaignKey)
    .maybeSingle();

  if (error || !data) {
    headerCache.set(campaignKey, null);
    return null;
  }

  const header = (data.header_image_url as string | null) ?? null;
  headerCache.set(campaignKey, header);
  const base = cache.get(campaignKey);
  if (base) {
    cache.set(campaignKey, { ...base, headerImageUrl: header });
  }
  return header;
}

export async function upsertSurveyCampaignSettings(
  supabase: SupabaseClient,
  settings: SurveyCampaignSettings
): Promise<void> {
  if (isDevMode()) {
    devSurveyStore.saveCampaignSettings(settings);
    invalidateSurveyCampaignSettingsCache(settings.campaignKey);
    return;
  }

  const { error } = await supabase.from("survey_campaign_settings").upsert(
    {
      campaign_key: settings.campaignKey,
      title: settings.title.trim(),
      intro_text: settings.introText.trim(),
      header_image_url: settings.headerImageUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "campaign_key" }
  );
  if (error) throw new Error(error.message);
  invalidateSurveyCampaignSettingsCache(settings.campaignKey);
}
