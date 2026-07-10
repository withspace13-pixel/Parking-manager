// 만족도 설문 질문 템플릿 저장·불러오기
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  seedSurveyCampaignSettingsCache,
  upsertSurveyCampaignSettings,
} from "@/lib/survey/survey-campaign-settings";
import {
  createSurveyQuestion,
  deleteSurveyQuestion,
  fetchSurveyQuestions,
  replaceSurveyQuestions,
} from "@/lib/survey/survey-questions";
import {
  DEFAULT_SURVEY_CAMPAIGN_TITLE,
  DEFAULT_SURVEY_INTRO_TEXT,
  type SurveyCampaignSettings,
  type SurveyQuestion,
  type SurveyQuestionTemplate,
  type SurveyQuestionTemplateItem,
} from "@/lib/survey/types";

export type SurveyTemplateApplyResult = {
  questions: SurveyQuestion[];
  settings: SurveyCampaignSettings;
};

let templatesCache: SurveyQuestionTemplate[] | null = null;
let templateSummariesCache: Array<Pick<SurveyQuestionTemplate, "id" | "name" | "isBuiltin">> | null =
  null;

export function invalidateSurveyQuestionTemplatesCache() {
  templatesCache = null;
  templateSummariesCache = null;
}

export type SurveyQuestionTemplateSummary = Pick<
  SurveyQuestionTemplate,
  "id" | "name" | "isBuiltin"
>;

function rowToTemplate(row: {
  id: string;
  name: string;
  title: string;
  intro_text: string;
  header_image_url: string | null;
  questions_json: SurveyQuestionTemplateItem[];
  is_builtin: boolean;
}): SurveyQuestionTemplate {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    introText: row.intro_text,
    headerImageUrl: row.header_image_url,
    questions: Array.isArray(row.questions_json) ? row.questions_json : [],
    isBuiltin: row.is_builtin,
  };
}

export async function fetchSurveyQuestionTemplateSummaries(
  supabase: SupabaseClient
): Promise<SurveyQuestionTemplateSummary[]> {
  if (templateSummariesCache) return templateSummariesCache;
  if (isDevMode()) {
    const list = devSurveyStore.getQuestionTemplates().map((t) => ({
      id: t.id,
      name: t.name,
      isBuiltin: t.isBuiltin,
    }));
    templateSummariesCache = list;
    return list;
  }

  const { data, error } = await supabase
    .from("survey_question_templates")
    .select("id, name, is_builtin")
    .order("name");

  if (error) {
    console.warn("[survey_question_templates summaries]", error.message);
    return [];
  }

  templateSummariesCache = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    isBuiltin: Boolean(row.is_builtin),
  }));
  return templateSummariesCache;
}

export async function fetchSurveyQuestionTemplateById(
  supabase: SupabaseClient,
  id: string
): Promise<SurveyQuestionTemplate | null> {
  if (templatesCache) {
    const cached = templatesCache.find((t) => t.id === id);
    if (cached) return cached;
  }
  if (isDevMode()) {
    const tpl = devSurveyStore.getQuestionTemplates().find((t) => t.id === id) ?? null;
    if (tpl && templatesCache) {
      const next = [...templatesCache.filter((t) => t.id !== id), tpl];
      templatesCache = next;
    }
    return tpl;
  }

  const { data, error } = await supabase
    .from("survey_question_templates")
    .select("id, name, title, intro_text, header_image_url, questions_json, is_builtin")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.warn("[survey_question_templates by id]", error?.message);
    return null;
  }

  const tpl = rowToTemplate(data as Parameters<typeof rowToTemplate>[0]);
  const existing = templatesCache ?? [];
  templatesCache = [...existing.filter((t) => t.id !== id), tpl];
  return tpl;
}

export async function fetchSurveyQuestionTemplates(
  supabase: SupabaseClient
): Promise<SurveyQuestionTemplate[]> {
  if (templatesCache) return templatesCache;
  if (isDevMode()) {
    templatesCache = devSurveyStore.getQuestionTemplates();
    templateSummariesCache = templatesCache.map((t) => ({
      id: t.id,
      name: t.name,
      isBuiltin: t.isBuiltin,
    }));
    return templatesCache;
  }

  const { data, error } = await supabase
    .from("survey_question_templates")
    .select("id, name, title, intro_text, header_image_url, questions_json, is_builtin")
    .order("name");

  if (error) {
    console.warn("[survey_question_templates fetch]", error.message);
    return [];
  }

  templatesCache = (data ?? []).map((row) => rowToTemplate(row as Parameters<typeof rowToTemplate>[0]));
  templateSummariesCache = templatesCache.map((t) => ({
    id: t.id,
    name: t.name,
    isBuiltin: t.isBuiltin,
  }));
  return templatesCache;
}

const BLANK_TEMPLATE_SNAPSHOT = {
  title: DEFAULT_SURVEY_CAMPAIGN_TITLE,
  introText: DEFAULT_SURVEY_INTRO_TEXT,
  headerImageUrl: null,
  questions: [] as SurveyQuestionTemplateItem[],
};

export async function createBlankSurveyQuestionTemplate(
  supabase: SupabaseClient,
  name?: string
): Promise<SurveyQuestionTemplate> {
  const templates = await fetchSurveyQuestionTemplates(supabase);
  const trimmed = name?.trim();
  const defaultName = trimmed || `템플릿 ${templates.length + 1}`;
  return saveSurveyQuestionTemplate(supabase, defaultName, BLANK_TEMPLATE_SNAPSHOT);
}

export async function saveSurveyQuestionTemplate(
  supabase: SupabaseClient,
  name: string,
  snapshot: {
    title: string;
    introText: string;
    headerImageUrl: string | null;
    questions: SurveyQuestionTemplateItem[];
  }
): Promise<SurveyQuestionTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("템플릿 이름을 입력해 주세요.");

  if (isDevMode()) {
    const tpl = devSurveyStore.saveQuestionTemplate(trimmed, snapshot);
    invalidateSurveyQuestionTemplatesCache();
    return tpl;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("survey_question_templates")
    .insert({
      name: trimmed,
      title: snapshot.title,
      intro_text: snapshot.introText,
      header_image_url: snapshot.headerImageUrl,
      questions_json: snapshot.questions,
      is_builtin: false,
      created_at: now,
      updated_at: now,
    })
    .select("id, name, title, intro_text, header_image_url, questions_json, is_builtin")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("같은 이름의 템플릿이 이미 있습니다.");
    throw new Error(error.message);
  }

  invalidateSurveyQuestionTemplatesCache();
  return rowToTemplate(data as Parameters<typeof rowToTemplate>[0]);
}

export async function updateSurveyQuestionTemplate(
  supabase: SupabaseClient,
  id: string,
  name: string,
  snapshot: {
    title: string;
    introText: string;
    headerImageUrl: string | null;
    questions: SurveyQuestionTemplateItem[];
  }
): Promise<SurveyQuestionTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("템플릿 이름을 입력해 주세요.");

  if (isDevMode()) {
    const tpl = devSurveyStore.updateQuestionTemplate(id, trimmed, snapshot);
    invalidateSurveyQuestionTemplatesCache();
    return tpl;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("survey_question_templates")
    .select("id, name, is_builtin")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("템플릿을 찾을 수 없습니다.");
  if (existing.is_builtin && trimmed !== existing.name) {
    throw new Error(`「${existing.name}」 기본 템플릿 이름은 변경할 수 없습니다.`);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("survey_question_templates")
    .update({
      name: trimmed,
      title: snapshot.title,
      intro_text: snapshot.introText,
      header_image_url: snapshot.headerImageUrl,
      questions_json: snapshot.questions,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, name, title, intro_text, header_image_url, questions_json, is_builtin")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("같은 이름의 템플릿이 이미 있습니다.");
    throw new Error(error.message);
  }

  invalidateSurveyQuestionTemplatesCache();
  return rowToTemplate(data as Parameters<typeof rowToTemplate>[0]);
}

export async function deleteSurveyQuestionTemplate(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  if (isDevMode()) {
    devSurveyStore.deleteQuestionTemplate(id);
    invalidateSurveyQuestionTemplatesCache();
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("survey_question_templates")
    .select("id, name, is_builtin")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) return;
  if (existing.is_builtin) {
    throw new Error(`「${existing.name}」 기본 템플릿은 삭제할 수 없습니다.`);
  }

  const { error } = await supabase.from("survey_question_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  invalidateSurveyQuestionTemplatesCache();
}

/** 템플릿을 해당 월 설문에 적용 — 기존 질문 일괄 교체 */
export async function applySurveyQuestionTemplate(
  supabase: SupabaseClient,
  campaignKey: string,
  template: SurveyQuestionTemplate
): Promise<SurveyTemplateApplyResult> {
  const settings: SurveyCampaignSettings = {
    campaignKey,
    title: template.title,
    introText: template.introText,
    headerImageUrl: template.headerImageUrl,
  };

  await upsertSurveyCampaignSettings(supabase, settings);
  const questions = await replaceSurveyQuestions(supabase, campaignKey, template.questions);
  seedSurveyCampaignSettingsCache(settings);

  return { questions, settings };
}

/** 현재 월 질문+설정을 템플릿 스냅샷으로 */
export async function buildSurveyTemplateSnapshot(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<{
  title: string;
  introText: string;
  headerImageUrl: string | null;
  questions: SurveyQuestionTemplateItem[];
}> {
  const { fetchSurveyCampaignSettings } = await import("@/lib/survey/survey-campaign-settings");
  const [settings, questions] = await Promise.all([
    fetchSurveyCampaignSettings(supabase, campaignKey),
    fetchSurveyQuestions(supabase, campaignKey),
  ]);
  return {
    title: settings.title,
    introText: settings.introText,
    headerImageUrl: settings.headerImageUrl,
    questions: questions.map((q) => ({
      questionType: q.questionType,
      title: q.title,
      required: q.required,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
      gridRows: q.gridRows,
    })),
  };
}
