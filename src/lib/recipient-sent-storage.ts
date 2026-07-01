// 감사문자·만족도 조사 발송 완료 담당자 ID (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmsCampaign } from "@/lib/sms-send-log";

export async function fetchRecipientSentIds(
  supabase: SupabaseClient,
  campaign: SmsCampaign,
  campaignKey: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("campaign_recipient_sent")
    .select("recipient_id")
    .eq("campaign", campaign)
    .eq("campaign_key", campaignKey);

  if (error) {
    console.warn("[campaign_recipient_sent fetch]", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.recipient_id as string));
}

export async function addRecipientSentId(
  supabase: SupabaseClient,
  campaign: SmsCampaign,
  campaignKey: string,
  recipientId: string
): Promise<void> {
  const { error } = await supabase.from("campaign_recipient_sent").upsert(
    {
      campaign,
      campaign_key: campaignKey,
      recipient_id: recipientId,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "campaign,campaign_key,recipient_id" }
  );
  if (error) console.warn("[campaign_recipient_sent add]", error.message);
}

export async function removeRecipientSentId(
  supabase: SupabaseClient,
  campaign: SmsCampaign,
  campaignKey: string,
  recipientId: string
): Promise<void> {
  const { error } = await supabase
    .from("campaign_recipient_sent")
    .delete()
    .eq("campaign", campaign)
    .eq("campaign_key", campaignKey)
    .eq("recipient_id", recipientId);
  if (error) console.warn("[campaign_recipient_sent remove]", error.message);
}
