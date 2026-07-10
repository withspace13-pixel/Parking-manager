// 감사문자·만족도 조사 공통 문구 치환 변수
export type MessageTemplateEvent = {
  eventName: string;
  dateLabel: string;
  startDate: string;
  endDate: string;
};

export const MESSAGE_TEMPLATE_VARIABLE_HINTS = [
  { token: "{담당자}", description: "담당자 이름으로 바뀝니다.", example: "김민선" },
  { token: "{기관명}", description: "대표 기관명으로 바뀝니다.", example: "위드스페이스" },
  { token: "{월}", description: "대상 월로 바뀝니다.", example: "7월" },
  { token: "{일자}", description: "대상 일자로 바뀝니다.", example: "7월 7일" },
  {
    token: "{행사명}",
    description: "행사명 1개만 나옵니다. 같은 날·같은 달에 여러 행사가 있어도 첫 번째 행사명만 사용합니다.",
    example: "세미나",
  },
  {
    token: "{행사목록}",
    description: "해당 담당자의 행사 목록 전체로 바뀝니다.",
    example: "1. 세미나 [ 7/2 ]",
  },
  {
    token: "{마감}",
    description: "만족도 설문 응답 마감 문구로 바뀝니다.",
    example: "2026년 8월 5일 오전 10시",
  },
  {
    token: "{url}",
    description: "담당자별 개별 설문 링크로 바뀝니다. 감사문자에서는 비워 둡니다.",
    example: "https://example.com/survey/abc123",
  },
] as const;

export const MESSAGE_TEMPLATE_PLACEHOLDER_TOKENS = MESSAGE_TEMPLATE_VARIABLE_HINTS.map(
  (hint) => hint.token
).join(" ");

export type MessageTemplateReplaceInput = {
  displayOrgName: string;
  manager: string;
  events: MessageTemplateEvent[];
  yearMonth: string;
  dayLabel: string;
  surveyUrl?: string;
};

function sortEvents(events: MessageTemplateEvent[]): MessageTemplateEvent[] {
  return [...events].sort((a, b) => {
    const byStart = a.startDate.localeCompare(b.startDate);
    if (byStart !== 0) return byStart;
    return a.endDate.localeCompare(b.endDate);
  });
}

export function formatCampaignMonthLabel(yearMonth: string): string {
  const [, m] = yearMonth.split("-");
  return `${Number(m)}월`;
}

export function formatMessageDayLabel(ymd: string): string {
  const [, m, d] = String(ymd).slice(0, 10).split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export function formatMessageEventLines(events: MessageTemplateEvent[]): string {
  return events.map((e, i) => `${i + 1}. ${e.eventName} [ ${e.dateLabel} ]`).join("\n");
}

export function formatMessageDeadlineLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}년 ${nextMonth}월 5일 오전 10시`;
}

/** 여러 행사 중 대표 행사명 1개 (정렬 후 첫 행사) */
export function formatPrimaryEventName(events: MessageTemplateEvent[]): string {
  const sorted = sortEvents(events);
  return sorted[0]?.eventName ?? "";
}

export function messageDayLabelFromEvents(
  events: MessageTemplateEvent[],
  yearMonth: string
): string {
  const sorted = sortEvents(events);
  if (sorted[0]?.endDate) {
    return formatMessageDayLabel(sorted[0].endDate);
  }
  return formatCampaignMonthLabel(yearMonth);
}

export function buildMessageTemplateReplacements(
  input: MessageTemplateReplaceInput
): Record<string, string> {
  return {
    "{담당자}": input.manager,
    "{기관명}": input.displayOrgName,
    "{월}": formatCampaignMonthLabel(input.yearMonth),
    "{일자}": input.dayLabel,
    "{행사명}": formatPrimaryEventName(input.events),
    "{행사목록}": formatMessageEventLines(input.events),
    "{마감}": formatMessageDeadlineLabel(input.yearMonth),
    "{url}": input.surveyUrl ?? "",
  };
}

export function applyMessageTemplateTokens(
  template: string,
  replacements: Record<string, string>
): string {
  let result = template;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function deriveMessageTemplateFromReplacements(
  body: string,
  replacements: Record<string, string>
): string {
  let t = body;
  const pairs = Object.entries(replacements)
    .filter(([, value]) => value)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([token, value]) => [value, token] as const);

  for (const [from, to] of pairs) {
    t = t.split(from).join(to);
  }
  return t;
}
