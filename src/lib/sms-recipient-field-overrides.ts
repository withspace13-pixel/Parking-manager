// 감사문자·만족도 조사 발송 전 기관명·담당자·연락처 수정 (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageTemplateCampaign } from "@/lib/message-templates";

export type SmsRecipientFieldOverrides = {
  org: Record<string, string>;
  manager: Record<string, string>;
  phone: Record<string, string>;
};

type FieldRow = {
  recipient_id: string;
  org_name: string | null;
  manager_name: string | null;
  phone: string | null;
};

const overridesCache: Partial<Record<MessageTemplateCampaign, SmsRecipientFieldOverrides>> = {};
const overridesFetchPromise: Partial<
  Record<MessageTemplateCampaign, Promise<SmsRecipientFieldOverrides>>
> = {};

export function invalidateSmsRecipientFieldOverridesCache(
  campaign: MessageTemplateCampaign
): void {
  delete overridesCache[campaign];
  delete overridesFetchPromise[campaign];
}

async function loadSmsRecipientFieldOverrides(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<SmsRecipientFieldOverrides> {
  const { data, error } = await supabase
    .from("sms_recipient_field_overrides")
    .select("recipient_id, org_name, manager_name, phone")
    .eq("campaign", campaign);

  if (error) {
    console.warn("[sms_recipient_field_overrides fetch]", error.message);
    return overridesCache[campaign] ?? { org: {}, manager: {}, phone: {} };
  }

  const org: Record<string, string> = {};
  const manager: Record<string, string> = {};
  const phone: Record<string, string> = {};

  for (const row of (data ?? []) as FieldRow[]) {
    if (row.org_name?.trim()) org[row.recipient_id] = row.org_name.trim();
    if (row.manager_name?.trim()) manager[row.recipient_id] = row.manager_name.trim();
    if (row.phone?.trim()) phone[row.recipient_id] = row.phone.trim();
  }

  const result = { org, manager, phone };
  overridesCache[campaign] = result;
  return result;
}

/** 발송 전 필드 수정값 — 캠페인별 세션 캐시, 저장 시에만 재조회 */
export async function fetchSmsRecipientFieldOverrides(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign
): Promise<SmsRecipientFieldOverrides> {
  const cached = overridesCache[campaign];
  if (cached) return cached;
  const pending = overridesFetchPromise[campaign];
  if (pending) return pending;
  const promise = loadSmsRecipientFieldOverrides(supabase, campaign).finally(() => {
    delete overridesFetchPromise[campaign];
  });
  overridesFetchPromise[campaign] = promise;
  return promise;
}

export async function upsertSmsRecipientFieldOverride(
  supabase: SupabaseClient,
  campaign: MessageTemplateCampaign,
  recipientId: string,
  patch: { orgName?: string; managerName?: string; phone?: string }
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("sms_recipient_field_overrides")
    .select("org_name, manager_name, phone")
    .eq("campaign", campaign)
    .eq("recipient_id", recipientId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const orgName =
    patch.orgName !== undefined ? patch.orgName.trim() || null : (existing?.org_name ?? null);
  const managerName =
    patch.managerName !== undefined
      ? patch.managerName.trim() || null
      : (existing?.manager_name ?? null);
  const phone =
    patch.phone !== undefined ? patch.phone.trim() || null : (existing?.phone ?? null);

  if (!orgName && !managerName && !phone) {
    const { error: deleteError } = await supabase
      .from("sms_recipient_field_overrides")
      .delete()
      .eq("campaign", campaign)
      .eq("recipient_id", recipientId);
    if (deleteError) throw new Error(deleteError.message);
    invalidateSmsRecipientFieldOverridesCache(campaign);
    return;
  }

  const { error } = await supabase.from("sms_recipient_field_overrides").upsert(
    {
      campaign,
      recipient_id: recipientId,
      org_name: orgName,
      manager_name: managerName,
      phone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "campaign,recipient_id" }
  );
  if (error) throw new Error(error.message || "담당자 정보 저장에 실패했습니다.");
  invalidateSmsRecipientFieldOverridesCache(campaign);
}
