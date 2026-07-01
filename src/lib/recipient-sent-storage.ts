// 감사문자·만족도 조사 발송 완료 담당자 ID (localStorage)

import type { SmsCampaign } from "@/lib/sms-send-log";

const STORAGE_KEYS: Record<SmsCampaign, string> = {
  survey: "parking-manager-survey-sent-v1",
  thank_you: "parking-manager-thankyou-sent-v1",
};

function readAll(campaign: SmsCampaign): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[campaign]);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(campaign: SmsCampaign, data: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS[campaign], JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function loadRecipientSentIds(campaign: SmsCampaign, campaignKey: string): Set<string> {
  const parsed = readAll(campaign);
  return new Set(parsed[campaignKey] ?? []);
}

export function saveRecipientSentIds(
  campaign: SmsCampaign,
  campaignKey: string,
  ids: Set<string>
): void {
  const parsed = readAll(campaign);
  parsed[campaignKey] = Array.from(ids);
  writeAll(campaign, parsed);
}

export function addRecipientSentId(
  campaign: SmsCampaign,
  campaignKey: string,
  recipientId: string
): void {
  const ids = loadRecipientSentIds(campaign, campaignKey);
  if (ids.has(recipientId)) return;
  ids.add(recipientId);
  saveRecipientSentIds(campaign, campaignKey, ids);
}

export function removeRecipientSentId(
  campaign: SmsCampaign,
  campaignKey: string,
  recipientId: string
): void {
  const ids = loadRecipientSentIds(campaign, campaignKey);
  if (!ids.has(recipientId)) return;
  ids.delete(recipientId);
  saveRecipientSentIds(campaign, campaignKey, ids);
}
