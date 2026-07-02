// 감사문자·만족도 조사 솔라피 발송 기록 (Supabase 공유)
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifySolapiStatusCode,
  formatSmsStatusLabel,
  type SmsDeliveryOutcome,
} from "@/lib/solapi-status";

export type SmsCampaign = "survey" | "thank_you";

export type SmsSendLogEntry = {
  id: string;
  campaign: SmsCampaign;
  campaignKey: string;
  recipientId: string;
  managerName: string;
  orgName: string;
  to: string;
  messageId?: string;
  statusCode: string;
  statusLabel: string;
  statusMessage: string;
  outcome: SmsDeliveryOutcome;
  sentAt: string;
};

const MAX_LOGS = 100;

type SmsSendLogRow = {
  id: string;
  campaign: string;
  campaign_key: string;
  recipient_id: string;
  manager_name: string;
  org_name: string;
  to_phone: string;
  message_id: string | null;
  status_code: string;
  status_label: string;
  status_message: string;
  outcome: string;
  sent_at: string;
};

let logCache: SmsSendLogEntry[] = [];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `smslog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rowToEntry(row: SmsSendLogRow): SmsSendLogEntry {
  return {
    id: row.id,
    campaign: row.campaign as SmsCampaign,
    campaignKey: row.campaign_key,
    recipientId: row.recipient_id,
    managerName: row.manager_name,
    orgName: row.org_name,
    to: row.to_phone,
    messageId: row.message_id ?? undefined,
    statusCode: row.status_code,
    statusLabel: row.status_label,
    statusMessage: row.status_message,
    outcome: row.outcome as SmsDeliveryOutcome,
    sentAt: row.sent_at,
  };
}

export function buildSmsSendLogEntry(params: {
  campaign: SmsCampaign;
  campaignKey: string;
  recipientId: string;
  managerName: string;
  orgName: string;
  to: string;
  messageId?: string;
  statusCode: string;
  statusMessage?: string;
  sentAt?: string;
}): SmsSendLogEntry {
  const statusCode = params.statusCode || "2000";
  const statusMessage = params.statusMessage?.trim() ?? "";
  const outcome = classifySolapiStatusCode(statusCode);
  return {
    id: newId(),
    campaign: params.campaign,
    campaignKey: params.campaignKey,
    recipientId: params.recipientId,
    managerName: params.managerName,
    orgName: params.orgName,
    to: params.to,
    messageId: params.messageId,
    statusCode,
    statusLabel: formatSmsStatusLabel(statusCode, statusMessage),
    statusMessage,
    outcome,
    sentAt: params.sentAt ?? new Date().toISOString(),
  };
}

export async function refreshSmsSendLogsCache(supabase: SupabaseClient): Promise<SmsSendLogEntry[]> {
  const { data, error } = await supabase
    .from("sms_send_logs")
    .select(
      "id, campaign, campaign_key, recipient_id, manager_name, org_name, to_phone, message_id, status_code, status_label, status_message, outcome, sent_at"
    )
    .order("sent_at", { ascending: false })
    .limit(MAX_LOGS);

  if (error) {
    console.warn("[sms_send_logs fetch]", error.message);
    return logCache;
  }

  logCache = (data ?? []).map((row) => rowToEntry(row as SmsSendLogRow));
  return logCache;
}

export function getSmsSendLogsCache(): SmsSendLogEntry[] {
  return logCache;
}

export type SmsLogQuery = {
  campaign?: SmsCampaign;
  campaignKey?: string;
  limit?: number;
  pendingOnly?: boolean;
};

export async function fetchSmsSendLogs(
  supabase: SupabaseClient,
  query: SmsLogQuery = {}
): Promise<SmsSendLogEntry[]> {
  let builder = supabase
    .from("sms_send_logs")
    .select(
      "id, campaign, campaign_key, recipient_id, manager_name, org_name, to_phone, message_id, status_code, status_label, status_message, outcome, sent_at"
    )
    .order("sent_at", { ascending: false })
    .limit(query.limit ?? MAX_LOGS);

  if (query.campaign) builder = builder.eq("campaign", query.campaign);
  if (query.campaignKey) builder = builder.eq("campaign_key", query.campaignKey);
  if (query.pendingOnly) builder = builder.eq("outcome", "pending");

  const { data, error } = await builder;
  if (error) {
    console.warn("[sms_send_logs fetch]", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToEntry(row as SmsSendLogRow));
}

export async function appendSmsSendLog(
  supabase: SupabaseClient,
  entry: SmsSendLogEntry
): Promise<void> {
  const { error } = await supabase.from("sms_send_logs").insert({
    id: entry.id,
    campaign: entry.campaign,
    campaign_key: entry.campaignKey,
    recipient_id: entry.recipientId,
    manager_name: entry.managerName,
    org_name: entry.orgName,
    to_phone: entry.to,
    message_id: entry.messageId ?? null,
    status_code: entry.statusCode,
    status_label: entry.statusLabel,
    status_message: entry.statusMessage,
    outcome: entry.outcome,
    sent_at: entry.sentAt,
  });

  if (error) {
    console.warn("[sms_send_logs append]", error.message);
    return;
  }

  logCache = [entry, ...logCache.filter((e) => e.id !== entry.id)].slice(0, MAX_LOGS);
}

export async function updateSmsSendLog(
  supabase: SupabaseClient,
  id: string,
  patch: Pick<SmsSendLogEntry, "statusCode" | "statusMessage" | "statusLabel" | "outcome">
): Promise<SmsSendLogEntry | null> {
  const idx = logCache.findIndex((e) => e.id === id);
  const prev = idx >= 0 ? logCache[idx]! : null;

  const { data, error } = await supabase
    .from("sms_send_logs")
    .update({
      status_code: patch.statusCode,
      status_message: patch.statusMessage,
      status_label: patch.statusLabel,
      outcome: patch.outcome,
    })
    .eq("id", id)
    .select(
      "id, campaign, campaign_key, recipient_id, manager_name, org_name, to_phone, message_id, status_code, status_label, status_message, outcome, sent_at"
    )
    .maybeSingle();

  if (error) {
    console.warn("[sms_send_logs update]", error.message);
    return prev;
  }
  if (!data) return null;

  const updated = rowToEntry(data as SmsSendLogRow);
  if (idx >= 0) {
    const next = [...logCache];
    next[idx] = updated;
    logCache = next;
  } else {
    logCache = [updated, ...logCache.filter((e) => e.id !== id)].slice(0, MAX_LOGS);
  }
  return updated;
}

export function filterSmsSendLogs(
  logs: SmsSendLogEntry[],
  campaign: SmsCampaign,
  campaignKey: string
): SmsSendLogEntry[] {
  return logs.filter((e) => e.campaign === campaign && e.campaignKey === campaignKey);
}

export function mergeSmsSendLogsIntoCache(entries: SmsSendLogEntry[]): SmsSendLogEntry[] {
  if (entries.length === 0) return logCache;
  const byId = new Map<string, SmsSendLogEntry>();
  for (const entry of logCache) byId.set(entry.id, entry);
  for (const entry of entries) byId.set(entry.id, entry);
  logCache = Array.from(byId.values())
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
    .slice(0, MAX_LOGS);
  return logCache;
}
