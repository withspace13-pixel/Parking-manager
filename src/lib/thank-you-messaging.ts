// 감사문자 대상 집계·미리보기 (종료일 일 단위, 사전세팅 제외)
import type { Project } from "@/lib/supabase";
import { addDaysToYmd } from "@/lib/archive-retention";
import { managerPhoneText } from "@/lib/manager-display";
import {
  estimateMessageType,
  formatProjectEventDateLabel,
  formatSurveyEventLines,
  getSurveyRecipientGroupKey,
  resolveRecipientPhone,
  resolveRecipientSendStatus,
  sortSurveyRecipientEvents,
  sortSurveyRecipientsByEventDate,
  type SurveyRecipient,
  type SurveyRecipientEvent,
  type SurveyRecipientSendStatus,
} from "@/lib/survey-messaging";

export type ThankYouRecipient = SurveyRecipient;
export type ThankYouRecipientEvent = SurveyRecipientEvent;
export type ThankYouRecipientSendStatus = SurveyRecipientSendStatus;

export { estimateMessageType, resolveRecipientPhone, resolveRecipientSendStatus, sortSurveyRecipientsByEventDate };

export function currentYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 감사문자 기본 대상일 — 전일 종료 행사 (종료 다음날 발송 흐름) */
export function defaultThankYouTargetDate(): string {
  return addDaysToYmd(currentYmd(), -1);
}

export function formatThankYouCampaignDayLabel(ymd: string): string {
  const [, m, d] = String(ymd).slice(0, 10).split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export type ThankYouMessageBuildParams = {
  displayOrgName: string;
  manager: string;
  targetDate: string;
  events: ThankYouRecipientEvent[];
};

/** 일괄 적용용: {담당자} {기관명} {일자} {행사목록} */
export const DEFAULT_THANK_YOU_MESSAGE_TEMPLATE = `{담당자}님, 안녕하세요. 위드스페이스입니다.^^
{일자} 진행하신 행사 이용해 주셔서 진심으로 감사드립니다.

▶ 이용하신 행사
{행사목록}

앞으로도 위드스페이스를 이용해 주시면 감사하겠습니다.`;

export function renderThankYouMessageTemplate(
  template: string,
  params: ThankYouMessageBuildParams
): string {
  return template
    .replaceAll("{기관명}", params.displayOrgName)
    .replaceAll("{담당자}", params.manager)
    .replaceAll("{일자}", formatThankYouCampaignDayLabel(params.targetDate))
    .replaceAll("{행사목록}", formatSurveyEventLines(params.events));
}

export function deriveThankYouTemplateFromMessage(
  body: string,
  sample: ThankYouMessageBuildParams
): string {
  let t = body;
  const pairs: Array<[string, string]> = [
    [sample.displayOrgName, "{기관명}"],
    [sample.manager, "{담당자}"],
    [formatThankYouCampaignDayLabel(sample.targetDate), "{일자}"],
    [formatSurveyEventLines(sample.events), "{행사목록}"],
  ];
  for (const [from, to] of pairs) {
    if (from) t = t.split(from).join(to);
  }
  return t;
}

export function buildThankYouMessage(
  params: ThankYouMessageBuildParams,
  template: string = DEFAULT_THANK_YOU_MESSAGE_TEMPLATE
): string {
  return renderThankYouMessageTemplate(template, params);
}

export function resolveThankYouMessageBody(
  params: ThankYouMessageBuildParams,
  options?: {
    individualBody?: string | null;
    bulkTemplate?: string | null;
  }
): string {
  if (options?.individualBody?.trim()) return options.individualBody.trim();
  if (options?.bulkTemplate?.trim()) {
    return renderThankYouMessageTemplate(options.bulkTemplate.trim(), params);
  }
  return buildThankYouMessage(params);
}

/** 종료일(end_date)이 선택한 날짜인 행사 · 담당자별 묶기 */
export function groupProjectsIntoThankYouRecipients(
  projects: Project[],
  targetDate: string,
  sentIds: Set<string> = new Set()
): ThankYouRecipient[] {
  const day = String(targetDate).slice(0, 10);
  const filtered = projects.filter((p) => String(p.end_date).slice(0, 10) === day);
  const map = new Map<string, ThankYouRecipient>();

  for (const p of filtered) {
    const id = getSurveyRecipientGroupKey(p);
    const phone = managerPhoneText(p.manager_phone) || null;
    const event: ThankYouRecipientEvent = {
      projectId: p.id,
      eventName: String(p.event_name ?? "").trim() || p.org_name,
      dateLabel: formatProjectEventDateLabel(p),
      startDate: String(p.start_date).slice(0, 10),
      endDate: String(p.end_date).slice(0, 10),
    };

    const existing = map.get(id);
    if (existing) {
      existing.events.push(event);
      if (!existing.managerPhone && phone) existing.managerPhone = phone;
      continue;
    }

    const sendStatus: ThankYouRecipientSendStatus = sentIds.has(id)
      ? "sent"
      : phone
        ? "pending"
        : "no_phone";

    map.set(id, {
      id,
      manager: String(p.manager ?? "").trim(),
      managerPhone: phone,
      displayOrgName: String(p.org_name ?? "").trim(),
      events: [event],
      sendStatus,
    });
  }

  return sortSurveyRecipientsByEventDate(
    Array.from(map.values()).map((recipient) => ({
      ...recipient,
      events: sortSurveyRecipientEvents(recipient.events),
    }))
  );
}
