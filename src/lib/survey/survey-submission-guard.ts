// 설문 응답 불일치 상태 정리 (레거시 데이터용)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevMode } from "@/lib/dev-mode";
import { devSurveyStore } from "@/lib/survey/dev-survey-store";
import { invalidateSurveyInvitesCache } from "@/lib/survey/survey-invites";

/** 제출 표시(submitted_at)는 있는데 응답 행이 없는 초대 */
export async function reconcileStaleSurveySubmissions(
  supabase: SupabaseClient,
  campaignKey: string
): Promise<number> {
  if (isDevMode()) {
    return devSurveyStore.reconcileStaleSubmissions(campaignKey);
  }

  const { data: inviteRows, error: inviteError } = await supabase
    .from("survey_invites")
    .select("token, submitted_at")
    .eq("campaign_key", campaignKey)
    .not("submitted_at", "is", null);

  if (inviteError) throw new Error(inviteError.message);
  const submitted = inviteRows ?? [];
  if (submitted.length === 0) return 0;

  const tokens = submitted.map((row) => row.token as string);
  const { data: answerRows, error: answerError } = await supabase
    .from("survey_answers")
    .select("invite_token")
    .in("invite_token", tokens);

  if (answerError) throw new Error(answerError.message);

  const tokensWithAnswers = new Set(
    (answerRows ?? []).map((row) => row.invite_token as string)
  );
  const staleTokens = tokens.filter((token) => !tokensWithAnswers.has(token));
  if (staleTokens.length === 0) return 0;

  const { error: updateError } = await supabase
    .from("survey_invites")
    .update({ submitted_at: null })
    .in("token", staleTokens);

  if (updateError) throw new Error(updateError.message);
  invalidateSurveyInvitesCache(campaignKey);
  return staleTokens.length;
}
