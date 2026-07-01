// 솔라피 메시지 상태코드 해석·표시 라벨

export type SmsDeliveryOutcome = "delivered" | "failed" | "pending";

/** 솔라피 4자리 상태코드 → 앱 내 결과 */
export function classifySolapiStatusCode(statusCode: string): SmsDeliveryOutcome {
  const code = String(statusCode ?? "").trim();
  if (!code) return "pending";
  if (code === "4000") return "delivered";
  if (code === "2000" || code === "3000") return "pending";
  if (code.startsWith("1")) return "failed";
  if (code.startsWith("2")) return "failed";
  if (code.startsWith("3")) return "failed";
  return "pending";
}

export function formatSmsStatusLabel(statusCode: string, statusMessage?: string): string {
  const code = String(statusCode ?? "").trim();
  const msg = statusMessage?.trim();

  if (code === "4000") return "발송 완료";
  if (code === "3000") return "발송 중";
  if (code === "2000") return "접수됨";
  if (code === "2230") return "잔액 부족";
  if (code === "3010") return "수신번호 형식 오류";
  if (code === "3013") return "발신번호 형식 오류";
  if (code.startsWith("1")) return msg || "접수 실패";
  if (code.startsWith("2")) return msg || "발송 불가";
  if (code.startsWith("3")) return msg || "발송 실패";

  return msg || (code ? `상태 ${code}` : "확인 중");
}

export function isTerminalStatusCode(statusCode: string): boolean {
  return classifySolapiStatusCode(statusCode) !== "pending";
}
