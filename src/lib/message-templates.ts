// 감사문자·만족도 조사 공통 문구 템플릿 저장소 (localStorage)
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

const STORAGE_KEY: Record<MessageTemplateCampaign, string> = {
  survey: "parking-manager-message-templates-survey-v1",
  thank_you: "parking-manager-message-templates-thankyou-v1",
};

export const MESSAGE_TEMPLATE_PLACEHOLDER_HINT: Record<MessageTemplateCampaign, string> = {
  survey: "{담당자} {기관명} {월} {행사목록} {마감} {url}",
  thank_you: "{담당자} {기관명} {일자} {행사목록}",
};

const DEFAULT_TEMPLATE_BODY: Record<MessageTemplateCampaign, string> = {
  survey: DEFAULT_SURVEY_MESSAGE_TEMPLATE,
  thank_you: DEFAULT_THANK_YOU_MESSAGE_TEMPLATE,
};

export function getDefaultMessageTemplateBody(campaign: MessageTemplateCampaign): string {
  return DEFAULT_TEMPLATE_BODY[campaign];
}

export function suggestNewTemplateName(campaign: MessageTemplateCampaign): string {
  const count = loadMessageTemplates(campaign).length;
  return `템플릿 ${count + 1}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadMessageTemplates(campaign: MessageTemplateCampaign): SavedMessageTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY[campaign]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedMessageTemplate[];
    return [...parsed].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } catch {
    return [];
  }
}

function persistMessageTemplates(campaign: MessageTemplateCampaign, templates: SavedMessageTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY[campaign], JSON.stringify(templates));
  } catch {
    /* ignore */
  }
}

export function createMessageTemplate(
  campaign: MessageTemplateCampaign,
  name: string,
  body: string
): SavedMessageTemplate {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName || !trimmedBody) {
    throw new Error("템플릿 이름과 본문을 입력해 주세요.");
  }
  const now = new Date().toISOString();
  const item: SavedMessageTemplate = {
    id: newId(),
    name: trimmedName,
    body: trimmedBody,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...loadMessageTemplates(campaign), item].sort((a, b) =>
    a.name.localeCompare(b.name, "ko")
  );
  persistMessageTemplates(campaign, next);
  return item;
}

export function updateMessageTemplate(
  campaign: MessageTemplateCampaign,
  id: string,
  patch: { name?: string; body?: string }
): SavedMessageTemplate | null {
  const list = loadMessageTemplates(campaign);
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const prev = list[idx]!;
  const name = patch.name !== undefined ? patch.name.trim() : prev.name;
  const body = patch.body !== undefined ? patch.body.trim() : prev.body;
  if (!name || !body) throw new Error("템플릿 이름과 본문을 입력해 주세요.");
  const updated: SavedMessageTemplate = {
    ...prev,
    name,
    body,
    updatedAt: new Date().toISOString(),
  };
  const next = [...list];
  next[idx] = updated;
  next.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  persistMessageTemplates(campaign, next);
  return updated;
}

export function deleteMessageTemplate(campaign: MessageTemplateCampaign, id: string): boolean {
  const list = loadMessageTemplates(campaign);
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  persistMessageTemplates(campaign, next);
  return true;
}
