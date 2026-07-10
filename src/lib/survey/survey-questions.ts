// 만족도 설문 질문 CRUD (Supabase + 세션 캐시)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import type { SurveyQuestion, SurveyQuestionType } from "@/lib/survey/types";

type QuestionRow = {
  id: string;
  campaign_key: string;
  sort_order: number;
  question_type: string;
  title: string;
  required: boolean;
  scale_min_label: string | null;
  scale_max_label: string | null;
  grid_rows: string[] | null;
  created_at: string;
  updated_at: string;
};

const cache = new Map<string, SurveyQuestion[]>();
const fetchPromises = new Map<string, Promise<SurveyQuestion[]>>();

function rowToQuestion(row: QuestionRow): SurveyQuestion {
  return {
    id: row.id,
    campaignKey: row.campaign_key,
    sortOrder: row.sort_order,
    questionType: row.question_type as SurveyQuestionType,
    title: row.title,
    required: row.required,
    scaleMinLabel: row.scale_min_label,
    scaleMaxLabel: row.scale_max_label,
    gridRows: Array.isArray(row.grid_rows) ? row.grid_rows : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function invalidateSurveyQuestionsCache(campaignKey?: string) {
  if (campaignKey) {
    cache.delete(campaignKey);
    fetchPromises.delete(campaignKey);
  } else {
    cache.clear();
    fetchPromises.clear();
  }
}

/** 네트워크 없이 캐시·UI 동기화 (템플릿 적용 직후) */
export function seedSurveyQuestionsCache(campaignKey: string, questions: SurveyQuestion[]) {
  cache.set(campaignKey, [...questions].sort((a, b) => a.sortOrder - b.sortOrder));
  fetchPromises.delete(campaignKey);
}

async function loadFromRemote(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<SurveyQuestion[]> {
  const { data, error } = await supabase
    .from("survey_questions")
    .select(
      "id, campaign_key, sort_order, question_type, title, required, scale_min_label, scale_max_label, grid_rows, created_at, updated_at"
    )
    .eq("campaign_key", campaignKey)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[survey_questions fetch]", error.message);
    return cache.get(campaignKey) ?? [];
  }

  const list = (data ?? []).map((row) => rowToQuestion(row as QuestionRow));
  cache.set(campaignKey, list);
  return list;
}

export async function fetchSurveyQuestions(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<SurveyQuestion[]> {
  if (isDevMode()) {
    return devSurveyStore.getQuestions(campaignKey);
  }
  const cached = cache.get(campaignKey);
  if (cached) return cached;
  const pending = fetchPromises.get(campaignKey);
  if (pending) return pending;
  const promise = loadFromRemote(supabase, campaignKey).finally(() => {
    fetchPromises.delete(campaignKey);
  });
  fetchPromises.set(campaignKey, promise);
  return promise;
}

export type SurveyQuestionInput = {
  questionType: SurveyQuestionType;
  title: string;
  required?: boolean;
  scaleMinLabel?: string | null;
  scaleMaxLabel?: string | null;
  gridRows?: string[];
};

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createSurveyQuestion(
  supabase: SupabaseClient,
  campaignKey: string,
  input: SurveyQuestionInput,
  sortOrder: number
): Promise<SurveyQuestion> {
  const now = new Date().toISOString();
  if (isDevMode()) {
    const list = devSurveyStore.getQuestions(campaignKey);
    const q: SurveyQuestion = {
      id: uuid(),
      campaignKey,
      sortOrder,
      questionType: input.questionType,
      title: input.title.trim(),
      required: input.required !== false,
      scaleMinLabel: input.scaleMinLabel?.trim() || null,
      scaleMaxLabel: input.scaleMaxLabel?.trim() || null,
      gridRows: input.gridRows ?? [],
      createdAt: now,
      updatedAt: now,
    };
    devSurveyStore.saveQuestions(campaignKey, [...list, q]);
    invalidateSurveyQuestionsCache(campaignKey);
    return q;
  }

  const { data, error } = await supabase
    .from("survey_questions")
    .insert({
      campaign_key: campaignKey,
      sort_order: sortOrder,
      question_type: input.questionType,
      title: input.title.trim(),
      required: input.required !== false,
      scale_min_label: input.scaleMinLabel?.trim() || null,
      scale_max_label: input.scaleMaxLabel?.trim() || null,
      grid_rows: input.gridRows ?? [],
      updated_at: now,
    })
    .select(
      "id, campaign_key, sort_order, question_type, title, required, scale_min_label, scale_max_label, grid_rows, created_at, updated_at"
    )
    .single();

  if (error) throw new Error(error.message);
  invalidateSurveyQuestionsCache(campaignKey);
  return rowToQuestion(data as QuestionRow);
}

export async function updateSurveyQuestion(
  supabase: SupabaseClient,
  campaignKey: string,
  id: string,
  input: Partial<SurveyQuestionInput> & { sortOrder?: number }
): Promise<void> {
  if (isDevMode()) {
    const list = devSurveyStore.getQuestions(campaignKey);
    const next = list.map((q) => {
      if (q.id !== id) return q;
      return {
        ...q,
        sortOrder: input.sortOrder ?? q.sortOrder,
        questionType: input.questionType ?? q.questionType,
        title: input.title?.trim() ?? q.title,
        required: input.required ?? q.required,
        scaleMinLabel:
          input.scaleMinLabel !== undefined ? input.scaleMinLabel?.trim() || null : q.scaleMinLabel,
        scaleMaxLabel:
          input.scaleMaxLabel !== undefined ? input.scaleMaxLabel?.trim() || null : q.scaleMaxLabel,
        gridRows: input.gridRows ?? q.gridRows,
        updatedAt: new Date().toISOString(),
      };
    });
    devSurveyStore.saveQuestions(campaignKey, next);
    invalidateSurveyQuestionsCache(campaignKey);
    return;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.questionType !== undefined) patch.question_type = input.questionType;
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.required !== undefined) patch.required = input.required;
  if (input.scaleMinLabel !== undefined) patch.scale_min_label = input.scaleMinLabel?.trim() || null;
  if (input.scaleMaxLabel !== undefined) patch.scale_max_label = input.scaleMaxLabel?.trim() || null;
  if (input.gridRows !== undefined) patch.grid_rows = input.gridRows;

  const { error } = await supabase
    .from("survey_questions")
    .update(patch)
    .eq("id", id)
    .eq("campaign_key", campaignKey);
  if (error) throw new Error(error.message);
  invalidateSurveyQuestionsCache(campaignKey);
}

export async function deleteSurveyQuestion(
  supabase: SupabaseClient,
  campaignKey: string,
  id: string
): Promise<void> {
  if (isDevMode()) {
    const list = devSurveyStore.getQuestions(campaignKey).filter((q) => q.id !== id);
    devSurveyStore.saveQuestions(campaignKey, list);
    invalidateSurveyQuestionsCache(campaignKey);
    return;
  }
  const { error } = await supabase
    .from("survey_questions")
    .delete()
    .eq("id", id)
    .eq("campaign_key", campaignKey);
  if (error) throw new Error(error.message);
  invalidateSurveyQuestionsCache(campaignKey);
}

/** 캠페인 질문 전체 교체 — 템플릿 적용용 (삭제 1회 + 삽입 1회) */
export async function replaceSurveyQuestions(
  supabase: SupabaseClient,
  campaignKey: string,
  inputs: SurveyQuestionInput[]
): Promise<SurveyQuestion[]> {
  const now = new Date().toISOString();

  if (isDevMode()) {
    const list = inputs.map((input, sortOrder) => ({
      id: uuid(),
      campaignKey,
      sortOrder,
      questionType: input.questionType,
      title: input.title.trim(),
      required: input.required !== false,
      scaleMinLabel: input.scaleMinLabel?.trim() || null,
      scaleMaxLabel: input.scaleMaxLabel?.trim() || null,
      gridRows: input.gridRows ?? [],
      createdAt: now,
      updatedAt: now,
    }));
    devSurveyStore.saveQuestions(campaignKey, list);
    seedSurveyQuestionsCache(campaignKey, list);
    return list;
  }

  const { error: deleteError } = await supabase
    .from("survey_questions")
    .delete()
    .eq("campaign_key", campaignKey);
  if (deleteError) throw new Error(deleteError.message);

  if (inputs.length === 0) {
    seedSurveyQuestionsCache(campaignKey, []);
    return [];
  }

  const { data, error } = await supabase
    .from("survey_questions")
    .insert(
      inputs.map((input, sortOrder) => ({
        campaign_key: campaignKey,
        sort_order: sortOrder,
        question_type: input.questionType,
        title: input.title.trim(),
        required: input.required !== false,
        scale_min_label: input.scaleMinLabel?.trim() || null,
        scale_max_label: input.scaleMaxLabel?.trim() || null,
        grid_rows: input.gridRows ?? [],
        updated_at: now,
      }))
    )
    .select(
      "id, campaign_key, sort_order, question_type, title, required, scale_min_label, scale_max_label, grid_rows, created_at, updated_at"
    );

  if (error) throw new Error(error.message);
  const list = (data ?? []).map((row) => rowToQuestion(row as QuestionRow));
  seedSurveyQuestionsCache(campaignKey, list);
  return list;
}

export async function reorderSurveyQuestions(
  supabase: SupabaseClient,
  campaignKey: string,
  orderedIds: string[]
): Promise<void> {
  if (isDevMode()) {
    const list = devSurveyStore.getQuestions(campaignKey);
    const map = new Map(list.map((q) => [q.id, q]));
    const next = orderedIds
      .map((id, i) => {
        const q = map.get(id);
        return q ? { ...q, sortOrder: i } : null;
      })
      .filter((q): q is SurveyQuestion => Boolean(q));
    devSurveyStore.saveQuestions(campaignKey, next);
    invalidateSurveyQuestionsCache(campaignKey);
    return;
  }
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("survey_questions")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("campaign_key", campaignKey)
    )
  );
  invalidateSurveyQuestionsCache(campaignKey);
}
