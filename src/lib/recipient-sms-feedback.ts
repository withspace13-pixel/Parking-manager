// 발송 결과 사용자 안내 문구

import type { SmsSendApiResult } from "@/lib/send-message-client";

export function describeSmsSendResult(result: SmsSendApiResult): string {
  if (result.outcome === "delivered") {
    return `발송이 완료되었습니다.\n(${result.statusLabel} · ${result.statusCode})`;
  }
  if (result.outcome === "failed") {
    const detail = result.statusMessage || result.statusLabel;
    return `발송에 실패했습니다.\n${detail}`;
  }
  return `발송이 접수되었습니다 (${result.statusLabel}).\n솔라피 처리 결과는 백그라운드에서 확인됩니다. 다른 탭·창으로 이동해도 자동 추적되며, 발송 기록에서 상태를 볼 수 있습니다.`;
}

export function shouldMarkRecipientAsSent(result: SmsSendApiResult): boolean {
  return result.outcome === "delivered";
}
