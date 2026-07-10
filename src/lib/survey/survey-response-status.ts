// 만족도 설문 담당자별 응답·발송 상태
export type SurveyResponseStatus = "not_sent" | "sent_pending" | "submitted";

export const SURVEY_RESPONSE_STATUS_LABEL: Record<SurveyResponseStatus, string> = {
  not_sent: "미발송",
  sent_pending: "발송됨(미제출)",
  submitted: "응답완료",
};

export function resolveSurveyResponseStatus(
  recipientId: string,
  sentIds: Set<string>,
  invite?: { submittedAt: string | null; answers?: Array<unknown> } | null
): SurveyResponseStatus {
  if (invite?.submittedAt && (invite.answers?.length ?? 0) > 0) return "submitted";
  if (sentIds.has(recipientId)) return "sent_pending";
  return "not_sent";
}
