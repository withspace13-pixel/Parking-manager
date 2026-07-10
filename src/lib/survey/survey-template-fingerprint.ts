// 설문 캠페인·템플릿 스냅샷 비교용 지문
import type {
  SurveyCampaignSettings,
  SurveyQuestion,
  SurveyQuestionTemplate,
  SurveyQuestionTemplateItem,
} from "@/lib/survey/types";

function normalizeQuestionItem(item: SurveyQuestionTemplateItem) {
  return {
    questionType: item.questionType,
    title: item.title.trim(),
    required: Boolean(item.required),
    scaleMinLabel: item.scaleMinLabel?.trim() || null,
    scaleMaxLabel: item.scaleMaxLabel?.trim() || null,
    gridRows: item.gridRows.map((row) => row.trim()).filter(Boolean),
  };
}

function questionItems(questions: SurveyQuestion[]) {
  return questions.map((q) =>
    normalizeQuestionItem({
      questionType: q.questionType,
      title: q.title,
      required: q.required,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
      gridRows: q.gridRows,
    })
  );
}

export function surveyCampaignSnapshotFingerprint(
  settings: SurveyCampaignSettings,
  questions: SurveyQuestion[]
): string {
  return JSON.stringify({
    title: settings.title.trim(),
    introText: settings.introText.trim(),
    headerImageUrl: settings.headerImageUrl?.trim() || null,
    questions: questionItems(questions),
  });
}

export function surveyQuestionTemplateFingerprint(template: SurveyQuestionTemplate): string {
  return JSON.stringify({
    title: template.title.trim(),
    introText: template.introText.trim(),
    headerImageUrl: template.headerImageUrl?.trim() || null,
    questions: template.questions.map(normalizeQuestionItem),
  });
}
