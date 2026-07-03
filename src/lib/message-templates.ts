// 감사문자·만족도 조사 문구 템플릿 (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SURVEY_MESSAGE_TEMPLATE } from "@/lib/survey-messaging";
import { DEFAULT_THANK_YOU_MESSAGE_TEMPLATE } from "@/lib/thank-you-messaging";

export type MessageTemplateCampaign = "survey" | "thank_you";

export type SavedMessageTemplate = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export const BUILTIN_MESSAGE_TEMPLATE_NAME: Record<MessageTemplateCampaign, string> = {
  survey: "기본 만족도조사",
  thank_you: "기본 감사문자",
};

export const MESSAGE_TEMPLATE_PLACEHOLDER_HINT: Record<MessageTemplateCampaign, string> = {
  survey: "{담당자} {기관명} {월} {행사목록} {마감} {url}",
  thank_you: "{담당자} {기관명} {일자} {행사목록}",
};

export const SEED_TEMPLATE_BODY: Record<MessageTemplateCampaign, string> = {
  survey: DEFAULT_SURVEY_MESSAGE_TEMPLATE,
  thank_you: DEFAULT_THANK_YOU_MESSAGE_TEMPLATE,
};

type MessageTemplateRow = {
  id: string;
  campaign: string;
  name: string;
  body: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
};

export function isBuiltinMessageTemplateName(
  campaign: MessageTemplateCampaign,
  name: string
): boolean {
  return name.trim() === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign];
}

function rowToSaved(row: MessageTemplateRow): SavedMessageTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortTemplates(templates: SavedMessageTemplate[]): SavedMessageTemplate[] {
  return [...templates].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

const templatesCache: Partial<Record<MessageTemplateCampaign, SavedMessageTemplate[]>> = {};
const templatesFetchPromise: Partial<
  Record<MessageTemplateCampaign, Promise<SavedMessageTemplate[]>>
> = {};

export function invalidateMessageTemplatesCache(campaign: MessageTemplateCampaign): void {
  delete templatesCache[campaign];
  delete templatesFetchPromise[campaign];
}

async function ensureBuiltinMessageTemplates(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<void> {
  const name = BUILTIN_MESSAGE_TEMPLATE_NAME[campaign];
  const { data, error } = await supabase
    .from("message_templates")
    .select("id")
    .eq("campaign", campaign)
    .eq("name", name)
    .maybeSingle();

  if (error) {
    console.warn("[message_templates ensure]", error.message);
    return;
  }
  if (data) return;

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("message_templates").insert({
    campaign,
    name,
    body: SEED_TEMPLATE_BODY[campaign],
    is_builtin: true,
    created_at: now,
    updated_at: now,
  });
  if (insertError) console.warn("[message_templates ensure insert]", insertError.message);
}

async function loadMessageTemplates(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<SavedMessageTemplate[]> {
  await ensureBuiltinMessageTemplates(supabase, campaign);

  const { data, error } = await supabase
    .from("message_templates")
    .select("id, campaign, name, body, is_builtin, created_at, updated_at")
    .eq("campaign", campaign)
    .order("name");

  if (error) {
    console.warn("[message_templates fetch]", error.message);
    return templatesCache[campaign] ?? [];
  }

  const list = sortTemplates((data ?? []).map((row) => rowToSaved(row as MessageTemplateRow)));
  templatesCache[campaign] = list;
  return list;
}

/** 문구 템플릿 목록 — 캠페인별 세션 캐시, 변경 시에만 재조회 */
export async function fetchMessageTemplates(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<SavedMessageTemplate[]> {
  const cached = templatesCache[campaign];
  if (cached) return cached;
  const pending = templatesFetchPromise[campaign];
  if (pending) return pending;
  const promise = loadMessageTemplates(supabase, campaign).finally(() => {
    delete templatesFetchPromise[campaign];
  });
  templatesFetchPromise[campaign] = promise;
  return promise;
}

export async function fetchBuiltinMessageTemplateBody(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<string> {
  const list = await fetchMessageTemplates(supabase, campaign);
  const builtin = list.find((t) => t.name === BUILTIN_MESSAGE_TEMPLATE_NAME[campaign]);
  return String(builtin?.body ?? "").trim() || SEED_TEMPLATE_BODY[campaign];
}

export function suggestNewTemplateName(templateCount: number): string {
  return `템플릿 ${templateCount + 1}`;
}

export async function createMessageTemplate(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  name: string,
  body: string
): Promise<SavedMessageTemplate> {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName || !trimmedBody) {
    throw new Error("템플릿 이름과 본문을 입력해 주세요.");
  }
  if (isBuiltinMessageTemplateName(campaign, trimmedName)) {
    throw new Error(`「${trimmedName}」 이름은 기본 템플릿 전용입니다.`);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      campaign,
      name: trimmedName,
      body: trimmedBody,
      is_builtin: false,
      created_at: now,
      updated_at: now,
    })
    .select("id, campaign, name, body, is_builtin, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("같은 이름의 템플릿이 이미 있습니다.");
    throw new Error(error.message || "템플릿 저장에 실패했습니다.");
  }

  invalidateMessageTemplatesCache(campaign);
  return rowToSaved(data as MessageTemplateRow);
}

export async function updateMessageTemplate(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  id: string,
  patch: { name?: string; body?: string }
): Promise<SavedMessageTemplate | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("message_templates")
    .select("id, campaign, name, body, is_builtin, created_at, updated_at")
    .eq("id", id)
    .eq("campaign", campaign)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) return null;

  const prev = existing as MessageTemplateRow;
  if (prev.is_builtin && patch.name !== undefined && patch.name.trim() !== prev.name) {
    throw new Error(`「${prev.name}」 템플릿 이름은 변경할 수 없습니다.`);
  }

  const nextName = patch.name !== undefined ? patch.name.trim() : prev.name;
  const nextBody = patch.body !== undefined ? patch.body.trim() : prev.body;
  if (!nextName || !nextBody) throw new Error("템플릿 이름과 본문을 입력해 주세요.");

  const { data, error } = await supabase
    .from("message_templates")
    .update({
      name: nextName,
      body: nextBody,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("campaign", campaign)
    .select("id, campaign, name, body, is_builtin, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("같은 이름의 템플릿이 이미 있습니다.");
    throw new Error(error.message || "템플릿 수정에 실패했습니다.");
  }

  invalidateMessageTemplatesCache(campaign);
  return rowToSaved(data as MessageTemplateRow);
}

export async function deleteMessageTemplate(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  id: string
): Promise<boolean> {
  const { data: existing, error: fetchError } = await supabase
    .from("message_templates")
    .select("id, name, is_builtin")
    .eq("id", id)
    .eq("campaign", campaign)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) return false;
  if (existing.is_builtin || isBuiltinMessageTemplateName(campaign, existing.name)) {
    throw new Error(`「${existing.name}」 기본 템플릿은 삭제할 수 없습니다.`);
  }

  const { error } = await supabase.from("message_templates").delete().eq("id", id).eq("campaign", campaign);
  if (error) throw new Error(error.message || "템플릿 삭제에 실패했습니다.");
  invalidateMessageTemplatesCache(campaign);
  return true;
}
