// 감사문자·만족도 조사 솔라피 발송 기록 (localStorage)

import {
  classifySolapiStatusCode,
  formatSmsStatusLabel,
  type SmsDeliveryOutcome,
} from "@/lib/solapi-status";

export type SmsCampaign = "survey" | "thank_you";

export type SmsSendLogEntry = {
  id: string;
  campaign: SmsCampaign;
  /** survey: YYYY-MM, thank_you: YYYY-MM-DD */
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

const STORAGE_KEY = "parking-manager-sms-send-log-v1";
const MAX_LOGS = 500;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `smslog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function loadSmsSendLogs(): SmsSendLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmsSendLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSmsSendLogs(logs: SmsSendLogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch {
    /* ignore */
  }
}

export function appendSmsSendLog(entry: SmsSendLogEntry): void {
  const next = [entry, ...loadSmsSendLogs()].slice(0, MAX_LOGS);
  persistSmsSendLogs(next);
}

export function updateSmsSendLog(
  id: string,
  patch: Pick<SmsSendLogEntry, "statusCode" | "statusMessage" | "statusLabel" | "outcome">
): SmsSendLogEntry | null {
  const list = loadSmsSendLogs();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const updated: SmsSendLogEntry = { ...list[idx]!, ...patch };
  const next = [...list];
  next[idx] = updated;
  persistSmsSendLogs(next);
  return updated;
}

export function filterSmsSendLogs(
  logs: SmsSendLogEntry[],
  campaign: SmsCampaign,
  campaignKey: string
): SmsSendLogEntry[] {
  return logs.filter((e) => e.campaign === campaign && e.campaignKey === campaignKey);
}
