// 만족도 설문 질문·응답·초대 타입 정의
export type SurveyQuestionType =
  | "scale"
  | "scale_grid"
  | "short"
  | "long"
  | "yes_no"
  | "choice"
  | "nps";

export type SurveyQuestion = {
  id: string;
  campaignKey: string;
  sortOrder: number;
  questionType: SurveyQuestionType;
  title: string;
  required: boolean;
  scaleMinLabel: string | null;
  scaleMaxLabel: string | null;
  /** scale_grid 행 또는 choice 선택지 */
  gridRows: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SurveyInvite = {
  token: string;
  campaignKey: string;
  recipientId: string;
  managerName: string;
  orgName: string;
  submittedAt: string | null;
  createdAt?: string;
  formSnapshot?: SurveyFormSnapshot | null;
};

/** 담당자별로 고정된 설문 본문 — 상단 이미지는 캠페인 참조(useCampaignHeader)로 용량 절약 */
export type SurveyFormSnapshot = {
  version: 1;
  frozenAt: string;
  title: string;
  introText: string;
  useCampaignHeader: boolean;
  /** 템플릿에 저장된 상단 이미지 (있을 때만) */
  templateHeaderImageUrl?: string | null;
  templateId?: string;
  templateName?: string;
  questions: Array<{
    id: string;
    sortOrder: number;
    questionType: SurveyQuestionType;
    title: string;
    required: boolean;
    scaleMinLabel: string | null;
    scaleMaxLabel: string | null;
    gridRows: string[];
  }>;
};

export type SurveyAnswerInput = {
  questionId: string;
  rowKey?: string | null;
  value: string;
};

export type SurveyAnswer = SurveyAnswerInput & {
  id: string;
  inviteToken: string;
  createdAt?: string;
};

export const SURVEY_SHORT_MAX = 50;
export const SURVEY_LONG_MAX = 200;
export const SURVEY_OTHER_MAX = 200;

export const SURVEY_CHOICE_OTHER_LABEL = "기타";

export const SURVEY_YES_NO_OPTIONS = ["예", "아니오", "모르겠음"] as const;

export const SURVEY_QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  scale: "5점 척도",
  scale_grid: "5점 척도 (그리드)",
  short: "단답형 (50자)",
  long: "장문형 (200자)",
  yes_no: "예 / 아니오 / 모르겠음",
  choice: "객관식",
  nps: "NPS (0~10점)",
};

/** 객관식 선택지 — 기타가 없으면 맨 뒤에 자동 추가 */
export function surveyChoiceOptions(gridRows: string[]): string[] {
  const rows = gridRows.map((s) => s.trim()).filter(Boolean);
  if (rows.some((r) => r === SURVEY_CHOICE_OTHER_LABEL)) return rows;
  return [...rows, SURVEY_CHOICE_OTHER_LABEL];
}

export function formatChoiceOtherValue(text: string): string {
  const trimmed = text.trim();
  return trimmed
    ? `${SURVEY_CHOICE_OTHER_LABEL}: ${trimmed}`
    : SURVEY_CHOICE_OTHER_LABEL;
}

export function isChoiceOtherValue(value: string): boolean {
  const v = value.trim();
  return v === SURVEY_CHOICE_OTHER_LABEL || v.startsWith(`${SURVEY_CHOICE_OTHER_LABEL}:`);
}

export function parseChoiceOtherText(value: string): string {
  const v = value.trim();
  if (v.startsWith(`${SURVEY_CHOICE_OTHER_LABEL}:`)) {
    return v.slice(SURVEY_CHOICE_OTHER_LABEL.length + 1).trim();
  }
  return "";
}

export type SurveyCampaignSettings = {
  campaignKey: string;
  title: string;
  introText: string;
  headerImageUrl: string | null;
  completionMessage: string;
};

export type SurveyQuestionTemplateItem = {
  questionType: SurveyQuestionType;
  title: string;
  required: boolean;
  scaleMinLabel: string | null;
  scaleMaxLabel: string | null;
  gridRows: string[];
};

export type SurveyQuestionTemplate = {
  id: string;
  name: string;
  title: string;
  introText: string;
  headerImageUrl: string | null;
  questions: SurveyQuestionTemplateItem[];
  isBuiltin?: boolean;
};

export const DEFAULT_SURVEY_CAMPAIGN_TITLE = "위드스페이스 만족도 조사";

export const DEFAULT_SURVEY_INTRO_TEXT = `안녕하세요, 위드스페이스입니다.
행사 진행에 대한 만족도 조사를 진행하고 있습니다.
설문에 참여해 주시면 감사하겠습니다.`;

export const DEFAULT_SURVEY_COMPLETION_MESSAGE = `설문 조사에 참여해 주셔서 감사합니다.
보내주신 소중한 의견을 바탕으로 앞으로 더 좋은 품질의 서비스를 제공하도록 노력하겠습니다.

위드스페이스에서 다시 뵐 수 있기를 기대하겠습니다.`;
