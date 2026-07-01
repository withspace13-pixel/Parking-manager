// 감사문자·만족도 조사 월별 일괄·담당자별 개별 문구 (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageTemplateCampaign } from "@/lib/message-templates";

export type CampaignMessageOverrides = {
  bulk: Record<string, string>;
  individual: Record<string, Record<string, string>>;
};

type OverrideRow = {
  campaign_key: string;
  recipient_id: string;
  body: string;
};

const BULK_RECIPIENT_ID = "";

function rowsToOverrides(rows: OverrideRow[]): CampaignMessageOverrides {
  const bulk: Record<string, string> = {};
  const individual: Record<string, Record<string, string>> = {};

  for (const row of rows) {
    const key = row.campaign_key;
    if (!row.recipient_id) {
      bulk[key] = row.body;
      continue;
    }
    if (!individual[key]) individual[key] = {};
    individual[key]![row.recipient_id] = row.body;
  }

  return { bulk, individual };
}

export async function fetchCampaignMessageOverrides(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<CampaignMessageOverrides> {
  const { data, error } = await supabase
    .from("campaign_message_overrides")
    .select("campaign_key, recipient_id, body")
    .eq("campaign", campaign);

  if (error) {
    console.warn("[campaign_message_overrides fetch]", error.message);
    return { bulk: {}, individual: {} };
  }

  return rowsToOverrides((data ?? []) as OverrideRow[]);
}

export async function upsertBulkMessageOverride(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  campaignKey: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("campaign_message_overrides").upsert(
    {
      campaign,
      campaign_key: campaignKey,
      recipient_id: BULK_RECIPIENT_ID,
      body: trimmed,
      updated_at: now,
    },
    { onConflict: "campaign,campaign_key,recipient_id" }
  );
  if (error) throw new Error(error.message || "일괄 문구 저장에 실패했습니다.");
}

export async function deleteBulkMessageOverride(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  campaignKey: string
): Promise<void> {
  const { error } = await supabase
    .from("campaign_message_overrides")
    .delete()
    .eq("campaign", campaign)
    .eq("campaign_key", campaignKey)
    .eq("recipient_id", BULK_RECIPIENT_ID);
  if (error) throw new Error(error.message || "일괄 문구 삭제에 실패했습니다.");
}

export async function upsertIndividualMessageOverride(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  campaignKey: string,
  recipientId: string,
  body: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("campaign_message_overrides").upsert(
    {
      campaign,
      campaign_key: campaignKey,
      recipient_id: recipientId,
      body: trimmed,
      updated_at: now,
    },
    { onConflict: "campaign,campaign_key,recipient_id" }
  );
  if (error) throw new Error(error.message || "개별 문구 저장에 실패했습니다.");
}

export async function clearIndividualMessageOverrides(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  campaignKey: string
): Promise<void> {
  const { error } = await supabase
    .from("campaign_message_overrides")
    .delete()
    .eq("campaign", campaign)
    .eq("campaign_key", campaignKey)
    .neq("recipient_id", BULK_RECIPIENT_ID);
  if (error) throw new Error(error.message || "개별 문구 삭제에 실패했습니다.");
}

export async function applyBulkMessageOverride(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  campaignKey: string,
  body: string
): Promise<CampaignMessageOverrides> {
  await upsertBulkMessageOverride(supabase, campaign, campaignKey, body);
  await clearIndividualMessageOverrides(supabase, campaign, campaignKey);
  return fetchCampaignMessageOverrides(supabase, campaign);
}
