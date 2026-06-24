// 만족도 설문 대상 집계·문자 미리보기 (종료일 기준, 사전세팅 제외)
import type { Project } from "@/lib/supabase";
import { managerPhoneText } from "@/lib/manager-display";
import { formatMonthDaySlash } from "@/lib/schedule-dates";

export type SurveyRecipientSendStatus = "pending" | "sent" | "no_phone";

export type SurveyRecipientEvent = {
  projectId: string;
  eventName: string;
  dateLabel: string;
  /** 정렬용 시작일 YYYY-MM-DD */
  startDate: string;
  /** 정렬용 종료일 YYYY-MM-DD */
  endDate: string;
};

export type SurveyRecipient = {
  id: string;
  manager: string;
  managerPhone: string | null;
  displayOrgName: string;
  events: SurveyRecipientEvent[];
  sendStatus: SurveyRecipientSendStatus;
};

/** YYYY-MM */
export function yearMonthFromYmd(ymd: string): string {
  return String(ymd).slice(0, 7);
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 담당자 묶기 키 — 번호 우선, 없으면 기관명+이름(동명이인 분리) */
export function getSurveyRecipientGroupKey(project: Project): string {
  const phone = managerPhoneText(project.manager_phone);
  if (phone) return `phone:${phone}`;
  const org = String(project.org_name ?? "").trim();
  const mgr = String(project.manager ?? "").trim();
  return `orgmgr:${org}::${mgr}`;
}

/** 본행사 start~end 일자만 (사전세팅 무관) */
export function formatProjectEventDateLabel(project: Project): string {
  const start = String(project.start_date).slice(0, 10);
  const end = String(project.end_date).slice(0, 10);
  if (start === end) return formatMonthDaySlash(start);
  return `${formatMonthDaySlash(start)}~${formatMonthDaySlash(end)}`;
}

export function formatSurveyCampaignMonthLabel(yearMonth: string): string {
  const [, m] = yearMonth.split("-");
  return `${Number(m)}월`;
}

/** 캠페인 월 M → 익월 5일 10시 마감 문구 */
export function surveyDeadlineLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}년 ${nextMonth}월 5일 오전 10시`;
}

export function estimateMessageType(body: string): "SMS" | "LMS" {
  const bytes = new TextEncoder().encode(body).length;
  return bytes <= 90 ? "SMS" : "LMS";
}

export type SurveyMessageBuildParams = {
  displayOrgName: string;
  manager: string;
  yearMonth: string;
  events: SurveyRecipientEvent[];
  surveyUrl?: string;
};

const DEFAULT_SURVEY_URL = "https://example.com/survey/미리보기";

/** 일괄 적용용 플레이스홀더: {담당자} {월} {행사목록} {마감} {url} (기관명은 기본 문구에 미사용) */
export const DEFAULT_SURVEY_MESSAGE_TEMPLATE = `{담당자}님, 안녕하세요. 위드스페이스입니다.^^
{월} 진행하신 행사에 대한 위드스페이스 만족도 조사입니다.

▶ 진행하신 행사
{행사목록}

추첨을 통해 선물을 드리오니 많은 참여 부탁드립니다.
설문에 참여해 주시면 감사하겠습니다. {마감}까지 참여 가능합니다.
{url}`;

export function formatSurveyEventLines(events: SurveyRecipientEvent[]): string {
  return events.map((e, i) => `${i + 1}. ${e.eventName} [ ${e.dateLabel} ]`).join("\n");
}

export function compareSurveyEvents(a: SurveyRecipientEvent, b: SurveyRecipientEvent): number {
  const byStart = a.startDate.localeCompare(b.startDate);
  if (byStart !== 0) return byStart;
  return a.endDate.localeCompare(b.endDate);
}

export function sortSurveyRecipientEvents(events: SurveyRecipientEvent[]): SurveyRecipientEvent[] {
  return [...events].sort(compareSurveyEvents);
}

export function getRecipientEarliestEvent(recipient: SurveyRecipient): SurveyRecipientEvent | null {
  if (recipient.events.length === 0) return null;
  return sortSurveyRecipientEvents(recipient.events)[0] ?? null;
}

/** 담당자 목록 — 가장 이른 행사(시작일 → 종료일) 기준 오름차순 */
export function compareSurveyRecipientsByEventDate(a: SurveyRecipient, b: SurveyRecipient): number {
  const ae = getRecipientEarliestEvent(a);
  const be = getRecipientEarliestEvent(b);
  if (!ae && !be) return 0;
  if (!ae) return 1;
  if (!be) return -1;
  const byEvent = compareSurveyEvents(ae, be);
  if (byEvent !== 0) return byEvent;
  const org = a.displayOrgName.localeCompare(b.displayOrgName, "ko");
  if (org !== 0) return org;
  return a.manager.localeCompare(b.manager, "ko");
}

export function sortSurveyRecipientsByEventDate(recipients: SurveyRecipient[]): SurveyRecipient[] {
  return [...recipients].sort(compareSurveyRecipientsByEventDate);
}

export function renderSurveyMessageTemplate(
  template: string,
  params: SurveyMessageBuildParams
): string {
  const url = params.surveyUrl ?? DEFAULT_SURVEY_URL;
  return template
    .replaceAll("{기관명}", params.displayOrgName)
    .replaceAll("{담당자}", params.manager)
    .replaceAll("{월}", formatSurveyCampaignMonthLabel(params.yearMonth))
    .replaceAll("{행사목록}", formatSurveyEventLines(params.events))
    .replaceAll("{마감}", surveyDeadlineLabel(params.yearMonth))
    .replaceAll("{url}", url);
}

/** 편집한 본문에서 담당자별 변수를 플레이스홀더로 바꿔 일괄 템플릿 생성 */
export function deriveSurveyTemplateFromMessage(
  body: string,
  sample: SurveyMessageBuildParams
): string {
  const url = sample.surveyUrl ?? DEFAULT_SURVEY_URL;
  let t = body;
  const pairs: Array<[string, string]> = [
    [sample.displayOrgName, "{기관명}"],
    [sample.manager, "{담당자}"],
    [formatSurveyCampaignMonthLabel(sample.yearMonth), "{월}"],
    [formatSurveyEventLines(sample.events), "{행사목록}"],
    [surveyDeadlineLabel(sample.yearMonth), "{마감}"],
    [url, "{url}"],
  ];
  for (const [from, to] of pairs) {
    if (from) t = t.split(from).join(to);
  }
  return t;
}

export function buildSatisfactionSurveyMessage(
  params: SurveyMessageBuildParams,
  template: string = DEFAULT_SURVEY_MESSAGE_TEMPLATE
): string {
  return renderSurveyMessageTemplate(template, params);
}

export function resolveSurveyMessageBody(
  params: SurveyMessageBuildParams,
  options?: {
    individualBody?: string | null;
    bulkTemplate?: string | null;
  }
): string {
  if (options?.individualBody?.trim()) return options.individualBody.trim();
  if (options?.bulkTemplate?.trim()) {
    return renderSurveyMessageTemplate(options.bulkTemplate.trim(), params);
  }
  return buildSatisfactionSurveyMessage(params);
}

/** 종료일(end_date)이 속한 월 기준으로 담당자별 묶기 */
export function groupProjectsIntoSurveyRecipients(
  projects: Project[],
  yearMonth: string,
  sentIds: Set<string> = new Set()
): SurveyRecipient[] {
  const filtered = projects.filter((p) => yearMonthFromYmd(String(p.end_date)) === yearMonth);
  const map = new Map<string, SurveyRecipient>();

  for (const p of filtered) {
    const id = getSurveyRecipientGroupKey(p);
    const phone = managerPhoneText(p.manager_phone) || null;
    const event: SurveyRecipientEvent = {
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

    const sendStatus: SurveyRecipientSendStatus = sentIds.has(id)
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

export function resolveRecipientPhone(
  recipient: SurveyRecipient,
  phoneOverrides: Record<string, string>
): string | null {
  const override = phoneOverrides[recipient.id];
  if (override !== undefined) {
    const digits = managerPhoneText(override);
    return digits || null;
  }
  return recipient.managerPhone;
}

export function resolveRecipientSendStatus(
  recipient: SurveyRecipient,
  sentIds: Set<string>,
  phoneOverrides: Record<string, string>
): SurveyRecipientSendStatus {
  if (sentIds.has(recipient.id)) return "sent";
  return resolveRecipientPhone(recipient, phoneOverrides) ? "pending" : "no_phone";
}
