// 만족도 설문 응답 Excel(CSV)보내기
import { sanitizeFilename } from "@/lib/parking-history-pdf";
import { formatSurveyCampaignMonthLabel } from "@/lib/survey-messaging";
import {
  SURVEY_RESPONSE_STATUS_LABEL,
  type SurveyResponseStatus,
} from "@/lib/survey/survey-response-status";
import type { SurveyFormSnapshot } from "@/lib/survey/types";

export type SurveyResponseExportRow = {
  orgName: string;
  managerName: string;
  status: SurveyResponseStatus;
  answers: Array<{ questionId: string; rowKey: string | null; value: string }>;
  formSnapshot?: SurveyFormSnapshot | null;
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatAnswerForSnapshotQuestion(
  question: SurveyFormSnapshot["questions"][number],
  answers: SurveyResponseExportRow["answers"]
): string {
  const qAnswers = answers.filter((a) => a.questionId === question.id);
  if (qAnswers.length === 0) return "";

  if (question.questionType === "scale_grid") {
    const rows = question.gridRows.length > 0 ? question.gridRows : ["항목"];
    return rows
      .map((row) => {
        const answer = qAnswers.find((a) => a.rowKey === row);
        return answer?.value ? `${row}: ${answer.value}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return qAnswers.find((a) => a.rowKey == null || a.rowKey === "")?.value ?? "";
}

export function buildSurveyResponsesCsv(rows: SurveyResponseExportRow[]): string {
  const maxQuestions = rows.reduce(
    (max, row) => Math.max(max, row.formSnapshot?.questions.length ?? 0),
    0
  );
  const headers = [
    "기관명",
    "담당자명",
    "상태",
    ...Array.from({ length: maxQuestions }, (_, index) => `${index + 1}번 질문`),
  ];

  const body = rows.map((row) => {
    const questions = [...(row.formSnapshot?.questions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    return [
      row.orgName,
      row.managerName,
      SURVEY_RESPONSE_STATUS_LABEL[row.status],
      ...Array.from({ length: maxQuestions }, (_, index) => {
        const question = questions[index];
        return question ? formatAnswerForSnapshotQuestion(question, row.answers) : "";
      }),
    ];
  });

  const lines = [headers, ...body].map((line) => line.map(escapeCsvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildSurveyResponsesExportFilename(campaignKey: string): string {
  const monthLabel = formatSurveyCampaignMonthLabel(campaignKey);
  return sanitizeFilename(`만족도조사_응답_${monthLabel}.csv`);
}

export function downloadSurveyResponsesExcel(
  campaignKey: string,
  rows: SurveyResponseExportRow[]
): void {
  const csv = buildSurveyResponsesCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildSurveyResponsesExportFilename(campaignKey);
  anchor.click();
  URL.revokeObjectURL(url);
}
