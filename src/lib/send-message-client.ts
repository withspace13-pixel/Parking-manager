// 브라우저에서 문자 발송 API 호출

import type { SmsDeliveryOutcome } from "@/lib/solapi-status";

export type SmsSendApiResult = {
  ok: true;
  messageId: string;
  to: string;
  statusCode: string;
  statusMessage: string;
  statusLabel: string;
  outcome: SmsDeliveryOutcome;
};

export type SolapiStatusResult = {
  configured: boolean;
};

export async function fetchSolapiStatus(): Promise<SolapiStatusResult> {
  try {
    const res = await fetch("/api/messages/status", { cache: "no-store" });
    if (!res.ok) return { configured: false };
    return (await res.json()) as SolapiStatusResult;
  } catch {
    return { configured: false };
  }
}

export async function sendMessageViaApi(params: {
  to: string;
  text: string;
}): Promise<SmsSendApiResult> {
  const res = await fetch("/api/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => ({}))) as SmsSendApiResult & { error?: string };

  if (!res.ok) {
    throw new Error(data.error ?? "문자 발송에 실패했습니다.");
  }

  if (!data.messageId) {
    throw new Error("솔라피 응답에 메시지 ID가 없습니다.");
  }

  return data;
}

export async function refreshMessageStatusesViaApi(
  messageIds: string[]
): Promise<Record<string, SmsSendApiResult>> {
  const res = await fetch("/api/messages/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageIds }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    statuses?: Record<string, SmsSendApiResult>;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "상태 조회에 실패했습니다.");
  }

  return data.statuses ?? {};
}
