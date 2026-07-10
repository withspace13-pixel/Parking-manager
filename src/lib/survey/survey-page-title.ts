// 공개 설문 페이지 브라우저 탭 제목
import { DEFAULT_SURVEY_CAMPAIGN_TITLE } from "@/lib/survey/types";

export function resolveSurveyPageTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed || DEFAULT_SURVEY_CAMPAIGN_TITLE;
}
