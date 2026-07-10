// 만족도 설문 응답 제출·검증
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import {
  getInviteDisplayForm,
  snapshotQuestionsToSurveyQuestions,
} from "@/lib/survey/survey-form-snapshot";
import { fetchSurveyInviteByToken, invalidateSurveyInvitesCache } from "@/lib/survey/survey-invites";
import type { SurveyAnswerInput, SurveyFormSnapshot, SurveyQuestion } from "@/lib/survey/types";
import { SURVEY_LONG_MAX, SURVEY_SHORT_MAX } from "@/lib/survey/types";

function lookupAnswerValue(
  qAnswers: Map<string | null, string> | undefined,
  rowKey: string | null
): string | undefined {
  if (!qAnswers) return undefined;
  const trimmed = (key: string | null) => qAnswers.get(key)?.trim();
  return trimmed(rowKey ?? null) || trimmed("") || trimmed(null);
}

export function validateSurveyAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswerInput[]
): string | null {
  const answerMap = new Map<string, Map<string | null, string>>();
  for (const a of answers) {
    const rowKey = a.rowKey ?? null;
    if (!answerMap.has(a.questionId)) answerMap.set(a.questionId, new Map());
    answerMap.get(a.questionId)!.set(rowKey, a.value.trim());
  }

  for (const q of questions) {
    const qAnswers = answerMap.get(q.id);

    if (q.questionType === "scale_grid") {
      const rows = q.gridRows.length > 0 ? q.gridRows : ["항목"];
      for (const row of rows) {
        const val = lookupAnswerValue(qAnswers, row);
        if (q.required && !val) return `「${q.title}」의 「${row}」에 응답해 주세요.`;
        if (val && !/^[1-5]$/.test(val)) return `「${q.title}」의 「${row}」는 1~5 중 선택해 주세요.`;
      }
      continue;
    }

    const val = lookupAnswerValue(qAnswers, null);
    if (q.required && !val) return `「${q.title}」에 응답해 주세요.`;

    if (!val) continue;

    if (q.questionType === "scale" && !/^[1-5]$/.test(val)) {
      return `「${q.title}」는 1~5 중 선택해 주세요.`;
    }
    if (q.questionType === "short" && val.length > SURVEY_SHORT_MAX) {
      return `「${q.title}」는 ${SURVEY_SHORT_MAX}자 이내로 입력해 주세요.`;
    }
    if (q.questionType === "long" && val.length > SURVEY_LONG_MAX) {
      return `「${q.title}」는 ${SURVEY_LONG_MAX}자 이내로 입력해 주세요.`;
    }
  }

  return null;
}

export async function submitSurveyAnswers(
  supabase: SupabaseClient,
  inviteToken: string,
  answers: SurveyAnswerInput[]
): Promise<void> {
  if (isDevMode()) {
    const devInvite = devSurveyStore.getInviteByToken(inviteToken);
    if (devInvite) {
      if (devInvite.submittedAt) throw new Error("이미 제출된 설문입니다. 수정할 수 없습니다.");
      const questions = devInvite.formSnapshot
        ? snapshotQuestionsToSurveyQuestions(devInvite.formSnapshot, devInvite.campaignKey)
        : devSurveyStore.getQuestions(devInvite.campaignKey);
      const err = validateSurveyAnswers(questions, answers);
      if (err) throw new Error(err);
      devSurveyStore.submitAnswers(
        inviteToken,
        answers.map((a) => ({
          questionId: a.questionId,
          rowKey: a.rowKey ?? null,
          value: a.value.trim(),
        }))
      );
      invalidateSurveyInvitesCache(devInvite.campaignKey);
      return;
    }
  }

  const invite = await fetchSurveyInviteByToken(supabase, inviteToken);
  if (!invite) throw new Error("유효하지 않은 설문 링크입니다.");
  if (invite.submittedAt) throw new Error("이미 제출된 설문입니다. 수정할 수 없습니다.");

  const { questions } = await getInviteDisplayForm(supabase, invite);
  const err = validateSurveyAnswers(questions, answers);
  if (err) throw new Error(err);

  const rows = answers.map((a) => ({
    invite_token: inviteToken,
    question_id: a.questionId,
    row_key: a.rowKey ?? null,
    answer_value: a.value.trim(),
  }));

  const { error: insertError } = await supabase.from("survey_answers").insert(rows);
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("survey_invites")
    .update({ submitted_at: new Date().toISOString() })
    .eq("token", inviteToken)
    .is("submitted_at", null);

  if (updateError) throw new Error(updateError.message);
  invalidateSurveyInvitesCache(invite.campaignKey);
}

export type SurveyScaleSummary = {
  questionId: string;
  title: string;
  type: "scale" | "scale_grid";
  rowKey?: string;
  average: number;
  count: number;
  distribution: Record<string, number>;
};

function summaryBucketKey(questionType: string, title: string, rowKey?: string): string {
  return `${questionType}::${title}::${rowKey ?? ""}`;
}

export function buildSurveySummary(
  invites: Array<{
    submittedAt: string | null;
    answers: Array<{ questionId: string; rowKey: string | null; value: string }>;
    formSnapshot?: SurveyFormSnapshot | null;
  }>,
  sentCount?: number
): {
  totalInvites: number;
  submittedCount: number;
  responseRate: number;
  scaleSummaries: SurveyScaleSummary[];
} {
  const submitted = invites.filter((i) => i.submittedAt && i.answers.length > 0);
  const buckets = new Map<string, SurveyScaleSummary & { values: number[] }>();

  for (const inv of submitted) {
    const questions = inv.formSnapshot?.questions ?? [];
    for (const q of questions) {
      if (q.questionType === "scale") {
        const a = inv.answers.find((x) => x.questionId === q.id && x.rowKey == null);
        if (!a || !/^[1-5]$/.test(a.value)) continue;
        const key = summaryBucketKey("scale", q.title);
        const bucket =
          buckets.get(key) ??
          ({
            questionId: q.id,
            title: q.title,
            type: "scale" as const,
            average: 0,
            count: 0,
            distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
            values: [],
          });
        bucket.values.push(Number(a.value));
        bucket.distribution[a.value] = (bucket.distribution[a.value] ?? 0) + 1;
        buckets.set(key, bucket);
      } else if (q.questionType === "scale_grid") {
        const rows = q.gridRows.length > 0 ? q.gridRows : ["항목"];
        for (const row of rows) {
          const a = inv.answers.find((x) => x.questionId === q.id && x.rowKey === row);
          if (!a || !/^[1-5]$/.test(a.value)) continue;
          const key = summaryBucketKey("scale_grid", q.title, row);
          const bucket =
            buckets.get(key) ??
            ({
              questionId: q.id,
              title: q.title,
              type: "scale_grid" as const,
              rowKey: row,
              average: 0,
              count: 0,
              distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
              values: [],
            });
          bucket.values.push(Number(a.value));
          bucket.distribution[a.value] = (bucket.distribution[a.value] ?? 0) + 1;
          buckets.set(key, bucket);
        }
      }
    }
  }

  const scaleSummaries: SurveyScaleSummary[] = Array.from(buckets.values()).map((b) => ({
    questionId: b.questionId,
    title: b.title,
    type: b.type,
    rowKey: b.rowKey,
    average: b.values.length ? b.values.reduce((s, v) => s + v, 0) / b.values.length : 0,
    count: b.values.length,
    distribution: b.distribution,
  }));

  const denominator = sentCount ?? invites.length;

  return {
    totalInvites: invites.length,
    submittedCount: submitted.length,
    responseRate: denominator ? (submitted.length / denominator) * 100 : 0,
    scaleSummaries,
  };
}
